require "zip"
require "nokogiri"

module XlsxSimpleReader
  module_function

  def read_rows(file_path, sheet_path: "xl/worksheets/sheet1.xml")
    Zip::File.open(file_path) do |zip|
      shared_strings = read_shared_strings(zip)
      sheet_xml = read_entry(zip, sheet_path)
      parse_sheet_rows(sheet_xml, shared_strings)
    end
  end

  def read_entry(zip, path)
    entry = zip.find_entry(path)
    raise "XLSX entry not found: #{path}" if entry.nil?
    entry.get_input_stream.read
  end

  def read_shared_strings(zip)
    xml = read_entry(zip, "xl/sharedStrings.xml")
    doc = Nokogiri::XML(xml)
    doc.remove_namespaces!

    doc.xpath("//sst/si").map do |si|
      si.xpath(".//t").map(&:text).join
    end
  rescue StandardError
    []
  end

  def parse_sheet_rows(sheet_xml, shared_strings)
    doc = Nokogiri::XML(sheet_xml)
    doc.remove_namespaces!

    rows = []
    doc.xpath("//worksheet/sheetData/row").each do |row|
      r = row["r"].to_i
      cells = {}

      row.xpath("./c").each do |c|
        ref = c["r"].to_s
        col = ref.gsub(/\d+/, "")
        next if col.empty?

        v_node = c.at_xpath("./v")
        next if v_node.nil?

        raw = v_node.text
        value =
          if c["t"] == "s"
            shared_strings[raw.to_i]
          else
            raw
          end
        cells[col] = value
      end

      rows << { row: r, cells: cells }
    end

    rows
  end
end

