# Strict ISO 8601 parsing for timestamps that arrive from a client, shared by every command
# that accepts one.
#
# A datetime column casts garbage to nil, which would silently clear a delivery date on a typo,
# so an unparseable value has to fail the command instead. Deliberately not Time.zone.parse,
# which is lenient enough to pull a weekday out of prose ("next tuesday-ish" becomes a real
# date) — the client sends the same format the change feed emits, so anything else is a bug
# worth reporting. A date with no time of day is accepted: a date picker has no reason to
# carry one.
module Iso8601Time
  def self.parse(value, field:)
    return nil if value.nil? || value.to_s.strip.empty?
    return value if value.is_a?(Time) || value.is_a?(DateTime)

    raw = value.to_s.strip
    begin
      Time.iso8601(raw)
    rescue ArgumentError
      begin
        Time.zone.parse(Date.iso8601(raw).to_s)
      rescue ArgumentError
        raise ArgumentError, "#{field} must be an ISO 8601 date"
      end
    end
  end
end
