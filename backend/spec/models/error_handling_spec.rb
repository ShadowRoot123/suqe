require "rails_helper"

# `rescue_from` resolves handlers most-recently-declared-first, which is the opposite of a `rescue`
# chain: a catch-all declared last silently shadows every handler above it, and the shadowed ones
# simply never run. That is not a hypothetical — every specific handler in ApplicationController was
# dead until the declarations were reordered, because `rescue_from StandardError` sat at the bottom.
#
# The trap is easy to walk back into, since RecordNotUnique and InvalidForeignKey are both
# subclasses of StatementInvalid. These examples assert which handler each error class actually
# resolves to, by source line, so a reordering that breaks it fails here instead of in production.
RSpec.describe "ApplicationController error handling" do
  def handler_line_for(error)
    ApplicationController.send(:find_rescue_handler, error).source_location[1]
  end

  def declaration_line(matcher)
    source = File.readlines(Rails.root.join("app/controllers/application_controller.rb"))
    index = source.index { |line| line.include?("rescue_from #{matcher} do") }
    raise "no rescue_from for #{matcher}" if index.nil?

    index + 1
  end

  it "routes each error class to its own handler, not to a more general one" do
    expected = {
      ActiveRecord::RecordNotFound.new("x") => "ActiveRecord::RecordNotFound",
      ActiveRecord::RecordNotUnique.new("x") => "ActiveRecord::RecordNotUnique",
      ActiveRecord::InvalidForeignKey.new("x") => "ActiveRecord::InvalidForeignKey",
      ActiveRecord::StatementInvalid.new("x") => "ActiveRecord::StatementInvalid",
      ActionController::ParameterMissing.new("x") => "ActionController::ParameterMissing"
    }

    expected.each do |error, matcher|
      expect(handler_line_for(error)).to eq(declaration_line(matcher)),
                                        "#{error.class} resolved to the handler on line " \
                                        "#{handler_line_for(error)}, not the #{matcher} handler " \
                                        "on line #{declaration_line(matcher)} — check the " \
                                        "declaration order in ApplicationController"
    end
  end

  it "still falls back to the catch-all for anything unrecognised" do
    expect(handler_line_for(RuntimeError.new("x"))).to eq(declaration_line("StandardError"))
  end

  # RecordInvalid is not a StatementInvalid, so it is only at risk from the catch-all.
  it "routes a validation failure to the validation handler" do
    record = Location.new
    record.valid?
    error = ActiveRecord::RecordInvalid.new(record)

    expect(handler_line_for(error)).to eq(declaration_line("ActiveRecord::RecordInvalid"))
  end
end
