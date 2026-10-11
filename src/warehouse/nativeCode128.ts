// Code 128 symbol patterns (ISO/IEC 15417; also used by BWIPP).
// ZPL invocation semantics: https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bc.html
const patterns: string[] = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];
const fail = (): never => {
  throw Error("invalid");
};

// Read the exact bars drawn in the preview, including the encoder's A/B/C
// decisions. Never ask printer automatic mode to choose a different encoding.
export function nativeCode128(svg: string, module: number) {
  if (!Number.isInteger(module) || module < 1 || module > 10) fail();
  const bars: { x: number; y: number; width: number; height: number }[] = [];
  for (const path of svg.matchAll(
    /<path stroke="#000000" stroke-width="([\d.]+)" d="([^"]+)"\s*\/>/g,
  )) {
    const width = Number(path[1]);
    for (const m of path[2].matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/g)) {
      if (m[1] !== m[3]) fail();
      bars.push({
        x: +m[1] - width / 2,
        y: Math.min(+m[2], +m[4]),
        width,
        height: Math.abs(+m[2] - +m[4]),
      });
    }
  }
  bars.sort((a, b) => a.x - b.x);
  if (
    !bars.length ||
    bars.some((b) => b.y !== bars[0].y || b.height !== bars[0].height)
  )
    fail();
  const runs: number[] = [];
  bars.forEach((b, i) => {
    runs.push(b.width / module);
    if (i + 1 < bars.length)
      runs.push((bars[i + 1].x - b.x - b.width) / module);
  });
  if (
    runs.some((v) => !Number.isInteger(v) || v < 1 || v > 4) ||
    runs.slice(-7).join("") !== patterns[106]
  )
    fail();
  const words: number[] = [];
  for (let i = 0; i < runs.length - 7; i += 6) {
    const word = patterns.indexOf(runs.slice(i, i + 6).join(""));
    if (word < 0) fail();
    words.push(word);
  }
  const checksum = words.pop();
  if (
    ![103, 104, 105].includes(words[0]) ||
    words.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103 !== checksum
  )
    fail();
  let subset = words[0] - 103;
  let shifted: number | undefined;
  let field = [">9", ">:", ">;"][subset];
  for (const word of words.slice(1)) {
    const active = shifted ?? subset;
    shifted = undefined;
    if ((active === 2 && word < 100) || (active === 0 && word < 95)) {
      field += String(word).padStart(2, "0");
    } else if (active === 1 && word < 95) {
      field +=
        word === 30
          ? ">0"
          : word === 62
            ? "><"
            : word === 94
              ? ">="
              : String.fromCharCode(word + 32);
    } else {
      field += ">" + String(word - 94);
      if (word === 99 && active !== 2) subset = 2;
      if (word === 100 && active !== 1) subset = 1;
      if (word === 101 && active !== 0) subset = 0;
      if (word === 98 && active !== 2) shifted = 1 - active;
    }
  }
  const hex = [...field]
    .map(
      (c) => "_" + c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase(),
    )
    .join("");
  return {
    x: bars[0].x,
    y: bars[0].y,
    height: bars[0].height,
    width: bars.at(-1)!.x + bars.at(-1)!.width - bars[0].x,
    module,
    hex,
    words,
  };
}

// Validate the generated field dialect and calculate its actual symbol width.
// Kept independent of DOM/encoder so the Electron boundary can use it too.
export function nativeCode128Width(hex: string, module: number) {
  if (!/^(?:_[0-9A-F]{2})+$/.test(hex) || module < 1 || module > 10) fail();
  const field = hex.replace(/_([0-9A-F]{2})/g, (_, h: string) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  let subset = [">9", ">:", ">;"].indexOf(field.slice(0, 2));
  if (subset < 0) fail();
  let count = 1,
    shifted: number | undefined;
  for (let i = 2; i < field.length; count++) {
    const active = shifted ?? subset;
    shifted = undefined;
    if (field[i] === ">") {
      const c = field[++i];
      i++;
      if (!"0<=12345678".includes(c ?? "!")) fail();
      if (c === "5" && active !== 2) subset = 2;
      if (c === "6" && active !== 1) subset = 1;
      if (c === "7" && active !== 0) subset = 0;
      if (c === "4" && active !== 2) shifted = 1 - active;
    } else if (active === 1) {
      const c = field.charCodeAt(i++);
      if (c < 32 || c > 125 || c === 94) fail();
    } else {
      if (!/^\d{2}$/.test(field.slice(i, i + 2))) fail();
      i += 2;
    }
  }
  return ((count + 1) * 11 + 13) * module;
}
