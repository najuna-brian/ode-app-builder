// Builds a small XLSForm .xlsx (inline strings, no dependencies beyond JSZip) for the tests.
const JSZip = require('jszip');
const SHEETS = {
  survey: [
    ['type', 'name', 'label::English (en)', 'label::Swahili (sw)', 'hint::English (en)', 'required', 'relevant', 'constraint', 'appearance'],
    ['start', 'start'],
    ['begin group', 'farmer', 'The farmer', 'Mkulima'],
    ['text', 'farmerName', 'Farmer name', 'Jina la mkulima', 'As on the ID card', 'yes'],
    ['integer', 'age', 'Age', 'Umri', '', 'yes', '', '. >= 18 and . <= 100'],
    ['select_one yn', 'has_plot', 'Has a plot?', 'Ana shamba?', '', 'yes'],
    ['end group'],
    ['begin group', 'plot', 'The plot', 'Shamba', '', '', "${has_plot} = 'yes'"],
    ['select_multiple crops', 'crops', 'Crops grown', 'Mazao', '', 'yes'],
    ['decimal', 'maize_acres', 'Maize acres', 'Ekari za mahindi', '', '', "selected(${crops}, 'maize')"],
    ['geopoint', 'plot_gps', 'Plot location', 'Mahali pa shamba'],
    ['image', 'plot_photo', 'Plot photo', 'Picha ya shamba'],
    ['text', 'notes', 'Notes', 'Maelezo', '', '', '', '', 'multiline'],
    ['calculate', 'total', ''],
    ['end group'],
  ],
  choices: [
    ['list_name', 'name', 'label::English (en)', 'label::Swahili (sw)'],
    ['yn', 'yes', 'Yes', 'Ndiyo'], ['yn', 'no', 'No', 'Hapana'],
    ['crops', 'maize', 'Maize', 'Mahindi'], ['crops', 'beans', 'Beans', 'Maharage'],
  ],
  settings: [['form_title', 'form_id', 'version', 'default_language'], ['Farm visit', 'farm_visit', '3', 'English (en)']],
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = (i) => String.fromCharCode(65 + i);
module.exports = async function makeXlsForm() {
  const zip = new JSZip();
  const names = Object.keys(SHEETS);
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>');
  names.forEach((n, si) => {
    const rows = SHEETS[n].map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => v === '' ? '' : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('') + '</row>').join('');
    zip.file(`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'nodebuffer' });
};
module.exports.SHEETS = SHEETS;
