// Baixa Instrument Serif + Instrument Sans do Google Fonts para dentro do projeto,
// e gera o CSS de @font-face apontando para os arquivos locais.
// Rodado uma única vez; o resultado é versionado no repositório.
import fs from "node:fs/promises";
import path from "node:path";

const DESTINO = process.argv[2];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const URL_CSS =
  "https://fonts.googleapis.com/css2" +
  "?family=Instrument+Sans:wght@400;500;600" +
  "&family=Instrument+Serif:ital@0;1" +
  "&display=swap";

const res = await fetch(URL_CSS, { headers: { "User-Agent": UA } });
if (!res.ok) throw new Error(`Google Fonts respondeu ${res.status}`);
const css = await res.text();

await fs.mkdir(path.join(DESTINO, "fonts"), { recursive: true });

// Cada bloco @font-face traz família, estilo, peso, url e unicode-range.
const blocos = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]+)}/g)];
const regras = [];
const baixados = new Map();

for (const [, subset, corpo] of blocos) {
  if (subset !== "latin" && subset !== "latin-ext") continue;

  const familia = corpo.match(/font-family:\s*'([^']+)'/)?.[1];
  const estilo = corpo.match(/font-style:\s*(\w+)/)?.[1] ?? "normal";
  const peso = corpo.match(/font-weight:\s*(\d+)/)?.[1] ?? "400";
  const url = corpo.match(/url\(([^)]+)\)\s*format\('woff2'\)/)?.[1];
  const range = corpo.match(/unicode-range:\s*([^;]+);/)?.[1];
  if (!familia || !url) continue;

  const nome =
    `${familia.replace(/\s+/g, "")}-${peso}${estilo === "italic" ? "-italic" : ""}-${subset}.woff2`;

  if (!baixados.has(url)) {
    const fonte = await fetch(url, { headers: { "User-Agent": UA } });
    if (!fonte.ok) throw new Error(`Falhou ao baixar ${nome}: ${fonte.status}`);
    const bytes = Buffer.from(await fonte.arrayBuffer());
    await fs.writeFile(path.join(DESTINO, "fonts", nome), bytes);
    baixados.set(url, nome);
    console.log(`  ${nome.padEnd(42)} ${(bytes.length / 1024).toFixed(1)} KB`);
  }

  regras.push(
    `@font-face {\n` +
      `  font-family: '${familia}';\n` +
      `  font-style: ${estilo};\n` +
      `  font-weight: ${peso};\n` +
      `  font-display: swap;\n` +
      `  src: url('/fonts/${baixados.get(url)}') format('woff2');\n` +
      (range ? `  unicode-range: ${range};\n` : "") +
      `}`,
  );
}

const cabecalho =
  "/* Instrument Serif + Instrument Sans — baixadas do Google Fonts e servidas\n" +
  "   localmente, para o app não depender de conexão externa para renderizar.\n" +
  "   Gerado por scripts/baixar-fontes.mjs — não editar à mão. */\n\n";

await fs.writeFile(path.join(DESTINO, "fonts", "fontes.css"), cabecalho + regras.join("\n\n") + "\n");
console.log(`\n${baixados.size} arquivos, ${regras.length} regras @font-face.`);
