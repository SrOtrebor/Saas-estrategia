const https = require("https");
const prompt = "artisan bread bakery warm golden light";
const encoded = encodeURIComponent(prompt);
const options = {
  hostname: "image.pollinations.ai",
  path: "/prompt/" + encoded + "?width=512&height=512&model=flux&nologo=true&seed=42",
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
};

console.log("Testeando Pollinations.ai...");
https.get(options, (res) => {
  console.log("Status:", res.statusCode);
  console.log("Content-Type:", res.headers["content-type"]);
  console.log("Location:", res.headers["location"] || "(sin redirect)");

  const chunks = [];
  res.on("data", c => chunks.push(c));
  res.on("end", () => {
    const buf = Buffer.concat(chunks);
    console.log("Tamaño:", buf.length, "bytes");
    if (buf.length < 2000) {
      console.log("Contenido:", buf.toString("utf8").substring(0, 500));
    } else {
      console.log("✅ Imagen recibida correctamente");
      const fs = require("fs");
      fs.writeFileSync("test-output/debug_pollinations.jpg", buf);
      console.log("Guardada en test-output/debug_pollinations.jpg");
    }
  });
}).on("error", e => console.log("Error:", e.message));
