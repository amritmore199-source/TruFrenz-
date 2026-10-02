import { glassSurfaceColor, glassTabAccent, setActiveGlassTint, setActiveGlassOpacity } from "@/lib/glass";
function over(fill: string, bg: number[]) {
  const m = fill.match(/(\d+), (\d+), (\d+)/)!; const a = Number(fill.match(/, ([\d.]+)\)$/)?.[1] ?? 1);
  return [0,1,2].map(i => Math.round(a*Number(m[i+1]) + (1-a)*bg[i]));
}
function cr(a: number[], b: number[]) {
  const f=(v:number)=>{v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};
  const L=(c:number[])=>0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);
  const l1=L(a),l2=L(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}
const hex=(c:number[])=>"#"+c.map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();
const ch=(c:number[])=>Math.max(...c)-Math.min(...c);
setActiveGlassOpacity(80);
for (const t of ["white","sky"] as const) {
  setActiveGlassTint(t);
  const card = over(glassSurfaceColor("rgba(255, 255, 255, 0.72)", 80), [250,250,251]);
  console.log(`${t.padEnd(6)} card ${hex(card)} chroma ${String(ch(card)).padStart(3)}  white ink ${cr([255,255,255],card).toFixed(2)}:1`);
  console.log(`       pill (chats) ${hex(over(glassTabAccent("chats",t).fill,[250,250,251]))}  white ink ${cr([255,255,255],over(glassTabAccent("chats",t).fill,[250,250,251])).toFixed(2)}:1`);
}
