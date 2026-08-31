/* Debug parser KMZ — replika logika worker */
import { Unzip, UnzipInflate } from "fflate";
import fs from "fs";

const bufZip = new Uint8Array(fs.readFileSync("samples/contoh.kmz"));

const decoder = new TextDecoder("utf-8");
let ketemu = false;
let teksKml = "";

const uz = new Unzip((zf) => {
  const isKml = zf.name.toLowerCase().endsWith(".kml");
  console.log("file di zip:", zf.name, "isKml:", isKml);
  if (isKml && !ketemu) {
    ketemu = true;
    zf.ondata = (err, data, final) => {
      if (err) {
        console.log("ERR:", err);
        return;
      }
      teksKml += decoder.decode(data, { stream: !final });
      console.log("chunk:", data.length, "final:", final);
    };
  } else {
    zf.ondata = () => {};
  }
  zf.start();
});
uz.register(UnzipInflate);

uz.push(bufZip, true);

setTimeout(() => {
  console.log("ketemu:", ketemu, "panjang kml:", teksKml.length);
  console.log("ada Placemark:", teksKml.includes("<Placemark"));
  console.log(teksKml.slice(0, 200));
}, 300);
