// Uji regex minimal
const placemark = "<Placemark>\n      <name>Area Kerja A</name>\n      <description>Contoh deskripsi teks polos tanpa HTML</description>\n      <Polygon><outerBoundaryIs><LinearRing><coordinates>\n        110.4290,-6.9930,0\n      </LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>";

const pgRe = /<Polygon[\s\S]*?outerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
console.log("A. match langsung:", pgRe.test(placemark));

const sederhana = "<Polygon><outerBoundaryIs><coordinates>1,2</coordinates></outerBoundaryIs></Polygon>";
console.log("B. match sederhana:", pgRe.test(sederhana));

// coba tanpa lazy
const pgRe2 = /<Polygon[\s\S]*outerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
console.log("C. greedy pertama:", pgRe2.test(placemark));

// kemungkinan masalah: deskripsi mengandung teks 'Polygon'? tidak. coba satukan
const m = placemark.match(/<Polygon/);
console.log("D. posisi '<Polygon':", m && m.index);
const m2 = placemark.match(/outerBoundaryIs/);
console.log("E. posisi 'outerBoundaryIs':", m2 && m2.index);
