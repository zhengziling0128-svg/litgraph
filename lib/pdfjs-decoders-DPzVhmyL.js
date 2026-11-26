// node_modules/unpdf/dist/pdfjs-loader.mjs
function createDecoderLoader(e) {
	return async (t) => {
		if (!Object.hasOwn(e, t)) throw Error(`No bundled decoder for ${t}`);
		let { default: n } = await e[t]();
		return n;
	};
}
// node_modules/unpdf/dist/pdfjs-decoders.mjs
const t = createDecoderLoader({
	"jbig2.wasm": () => import("./pdfjs-jbig2-BHGfCVHA.js"),
	"jbig2_nowasm_fallback.js": () => import("./pdfjs-jbig2_nowasm_fallback-DSGIu-ri.js"),
	"openjpeg.wasm": () => import("./pdfjs-openjpeg-27nDh0Cg.js"),
	"openjpeg_nowasm_fallback.js": () => import("./pdfjs-openjpeg_nowasm_fallback-Ds3pDg4V.js")
});
export { t as loadDecoder };
