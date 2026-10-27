// Generates the profile README and its SVG images (light and dark) from projects.json.
// Every pattern is a flow field seeded from the project name, so output is deterministic.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARDS_DIR = join(ROOT, "assets", "cards");

const CARD = { width: 440, height: 168, padding: 24, radius: 12 };
const BANNER = { width: 1200, height: 240, radius: 16 };

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;

const THEMES = {
	light: { surface: "#f6f8fa", text: "#1f2328", muted: "#59636e", faint: "#818b98", lightness: 48, saturation: 70, opacity: 0.55 },
	dark: { surface: "#151b23", text: "#f0f6fc", muted: "#9198a1", faint: "#656c76", lightness: 64, saturation: 75, opacity: 0.5 },
};

// Brand marks from Simple Icons (CC0), drawn on a 24x24 grid.
const ICONS = {
	linkedin: {
		color: { light: "#0a66c2", dark: "#3d8fe0" },
		path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
	},
	x: {
		color: { light: "#1f2328", dark: "#f0f6fc" },
		path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
	},
	codepen: {
		color: { light: "#1f2328", dark: "#f0f6fc" },
		path: "M18.144 13.067v-2.134L16.55 12zm1.276 1.194a.628.628 0 01-.006.083l-.005.028-.011.053-.01.031c-.005.016-.01.031-.017.047l-.014.03a.78.78 0 01-.021.043l-.019.03a.57.57 0 01-.08.1l-.026.025a.602.602 0 01-.036.03l-.029.022-.01.008-6.782 4.522a.637.637 0 01-.708 0L4.864 14.79l-.01-.008a.599.599 0 01-.065-.052l-.026-.025-.032-.034-.021-.028a.588.588 0 01-.067-.11l-.014-.031a.644.644 0 01-.017-.047l-.01-.03c-.004-.018-.008-.036-.01-.054l-.006-.028a.628.628 0 01-.006-.083V9.739c0-.028.002-.055.006-.083l.005-.027.011-.054.01-.03a.574.574 0 01.12-.217l.031-.034.026-.025a.62.62 0 01.065-.052l.01-.008 6.782-4.521a.638.638 0 01.708 0l6.782 4.521.01.008.03.022.035.03c.01.008.017.016.026.025a.545.545 0 01.08.1l.019.03a.633.633 0 01.021.043l.014.03c.007.016.012.032.017.047l.01.031c.004.018.008.036.01.054l.006.027a.619.619 0 01.006.083zM12 0C5.373 0 0 5.372 0 12 0 18.627 5.373 24 12 24c6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12m0 10.492L9.745 12 12 13.51 14.255 12zm.638 4.124v2.975l4.996-3.33-2.232-1.493zm-6.272-.356l4.996 3.33v-2.974l-2.764-1.849zm11.268-4.52l-4.996-3.33v2.974l2.764 1.85zm-6.272-.356V6.41L6.366 9.74l2.232 1.493zm-5.506 1.549v2.134L7.45 12Z",
	},
	npm: {
		color: { light: "#cb3837", dark: "#e5534b" },
		path: "M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z",
	},
};

const LANGUAGE_COLORS = { TypeScript: "#3178c6", JavaScript: "#f1e05a", Rust: "#dea584" };

/**
 * Hashes a string into a 32-bit unsigned seed (FNV-1a).
 * @param {string} value
 * @returns {number}
 */
function hash(value) {
	let h = 2166136261;
	for (const char of value) {
		h ^= char.codePointAt(0);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/**
 * Creates a seeded pseudo-random generator (mulberry32).
 * @param {number} seed
 * @returns {() => number} Function returning floats in [0, 1)
 */
function random(seed) {
	let state = seed;
	return function next() {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Escapes text for use inside SVG/HTML.
 * @param {string} value
 * @returns {string}
 */
function escape(value) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Splits text into lines of at most `maxChars` characters, breaking on spaces.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function wrap(text, maxChars) {
	const lines = [];
	let line = "";
	for (const word of text.split(" ")) {
		if (line && line.length + word.length + 1 > maxChars) {
			lines.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/**
 * Traces streamlines through a seeded flow field.
 * @param {object} options
 * @param {string} options.seed - Text the field is derived from
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.fromX - Left edge of the area where lines start
 * @param {number} options.lines - Number of streamlines
 * @param {number} options.steps - Integration steps per line
 * @param {number} options.stepLength - Distance per step
 * @returns {Array<Array<[number, number]>>} Polylines as point lists
 */
function flowField({ seed, width, height, fromX, lines, steps, stepLength }) {
	const rand = random(hash(seed));
	const scale = Math.max(width, height);
	const waves = Array.from({ length: 3 }, function createWave() {
		return {
			fx: ((1 + rand() * 2.5) * Math.PI * 2) / scale,
			fy: ((1 + rand() * 2.5) * Math.PI * 2) / scale,
			phase: rand() * Math.PI * 2,
			weight: 0.4 + rand() * 0.6,
		};
	});
	const drift = rand() * Math.PI * 2;

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {number} Flow direction in radians
	 */
	function angle(x, y) {
		let sum = 0;
		for (const wave of waves) sum += wave.weight * Math.sin(x * wave.fx + wave.phase) * Math.cos(y * wave.fy - wave.phase);
		return drift + sum * Math.PI;
	}

	const polylines = [];
	for (let i = 0; i < lines; i++) {
		let x = fromX + rand() * (width - fromX);
		let y = rand() * height;
		const points = [[x, y]];
		for (let step = 0; step < steps; step++) {
			const a = angle(x, y);
			x += Math.cos(a) * stepLength;
			y += Math.sin(a) * stepLength;
			if (x < -20 || x > width + 20 || y < -20 || y > height + 20) break;
			points.push([x, y]);
		}
		if (points.length > 4) polylines.push(points);
	}
	return polylines;
}

/**
 * Hermite smoothstep between two edges.
 * @param {number} from
 * @param {number} to
 * @param {number} value
 * @returns {number} 0 at or below `from`, 1 at or above `to`
 */
function smoothstep(from, to, value) {
	const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
	return t * t * (3 - 2 * t);
}

/**
 * Builds the pattern's visibility function: a left-to-right fade that also clears soft halos around text.
 * Computed here instead of with SVG masks or filters, which some Markdown renderers ignore.
 * @param {number} fadeFrom - x where lines start to appear
 * @param {number} fadeTo - x where lines reach full strength
 * @param {Array<[number, number, number, number]>} boxes - Text bounds as [x, y, width, height]
 * @returns {(x: number, y: number) => number} Visibility in [0, 1]
 */
function visibility(fadeFrom, fadeTo, boxes) {
	return function visibleAt(x, y) {
		let value = smoothstep(fadeFrom, fadeTo, x);
		for (const [bx, by, bw, bh] of boxes) {
			const dx = Math.max(bx - x, 0, x - (bx + bw));
			const dy = Math.max(by - y, 0, y - (by + bh));
			value *= smoothstep(0, 12, Math.hypot(dx, dy));
		}
		return value;
	};
}

/**
 * Splits polylines into runs of similar visibility and renders each run with a matching stroke opacity.
 * @param {Array<Array<[number, number]>>} polylines
 * @param {(x: number, y: number) => number} visibleAt
 * @param {number} opacity - Opacity at full visibility
 * @returns {string} SVG path elements
 */
function strokes(polylines, visibleAt, opacity) {
	const levels = 10;
	const runs = [];
	for (const points of polylines) {
		let run = null;
		for (const point of points) {
			const level = Math.round(visibleAt(...point) * levels);
			if (run?.level === level) {
				run.points.push(point);
				continue;
			}
			if (run) {
				run.points.push(point);
				if (run.level > 0) runs.push(run);
			}
			run = { level, points: [point] };
		}
		if (run && run.level > 0 && run.points.length > 1) runs.push(run);
	}
	return runs
		.map(function toPath({ level, points }) {
			const d = points
				.map(function toCommand([x, y], index) {
					return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
				})
				.join("");
			return `<path d="${d}" stroke-opacity="${((level / levels) * opacity).toFixed(2)}"/>`;
		})
		.join("\n\t\t\t");
}

/**
 * Returns the accent color for a hue in the given theme.
 * @param {number} hue
 * @param {typeof THEMES.light} theme
 * @returns {string}
 */
function accent(hue, theme) {
	return `hsl(${hue} ${theme.saturation}% ${theme.lightness}%)`;
}

/**
 * Renders a project card.
 * @param {object} item - Project entry from projects.json
 * @param {number} hue - Section accent hue
 * @param {typeof THEMES.light} theme
 * @returns {string} SVG markup
 */
function renderCard(item, hue, theme) {
	const { width, height, padding, radius } = CARD;
	const id = item.name.replace(/\W+/g, "-");
	const color = accent(hue, theme);
	const dot = LANGUAGE_COLORS[item.meta] ?? color;
	const polylines = flowField({ seed: item.name, width, height, fromX: width * 0.35, lines: 34, steps: 90, stepLength: 2.6 });
	const lines = wrap(item.description, 52).slice(0, 2);
	const commandWidth = item.command ? (item.command.length + 2) * 7.6 : 0;
	const visibleAt = visibility(width * 0.35, width, [
		[padding - 8, padding + 2, item.name.length * 10.5 + 16, 26],
		[width - padding - item.meta.length * 6.6 - 26, padding + 1, item.meta.length * 6.6 + 34, 20],
		...lines.map(function toBox(line, index) {
			return [padding - 8, padding + 34 + index * 20, line.length * 6.9 + 16, 22];
		}),
		...(item.command ? [[padding - 8, height - 46, commandWidth + 16, 24]] : []),
	]);
	const description = lines
		.map(function toTspan(line, index) {
			return `<tspan x="${padding}" dy="${index === 0 ? 0 : 20}">${escape(line)}</tspan>`;
		})
		.join("");

	let footer = "";
	if (item.command && item.commandKind === "url") {
		footer = `
	<g transform="translate(${padding} ${height - 37})" fill="none" stroke="${theme.faint}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<path d="M4 10 10 4M5 4h5v5"/>
	</g>
	<text x="${padding + 20}" y="${height - 28}" font-family="${MONO}" font-size="12.5" fill="${theme.muted}">${escape(item.command)}</text>`;
	} else if (item.command) {
		footer = `
	<text x="${padding}" y="${height - 28}" font-family="${MONO}" font-size="12.5" fill="${theme.muted}"><tspan fill="${theme.faint}">$ </tspan>${escape(item.command)}</text>`;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(`${item.name}: ${item.description}`)}">
	<defs>
		<clipPath id="clip-${id}"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>
	</defs>
	<g clip-path="url(#clip-${id})">
		<rect width="${width}" height="${height}" fill="${theme.surface}"/>
		<g fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round">
			${strokes(polylines, visibleAt, theme.opacity)}
		</g>
	</g>
	<text x="${padding}" y="${padding + 20}" font-family="${SANS}" font-size="18" font-weight="600" fill="${theme.text}">${escape(item.name)}</text>
	<g transform="translate(${width - padding} ${padding + 15})">
		<text text-anchor="end" font-family="${SANS}" font-size="12" fill="${theme.muted}">${escape(item.meta)}</text>
		<circle cx="${-(item.meta.length * 6.6 + 10)}" cy="-4" r="4.5" fill="${dot}"/>
	</g>
	<text x="${padding}" y="${padding + 50}" font-family="${SANS}" font-size="13.5" fill="${theme.muted}">${description}</text>${footer}
</svg>
`;
}

/**
 * Renders the profile banner.
 * @param {object} profile - Profile entry from projects.json
 * @param {number[]} hues - Section hues, used left to right across the pattern
 * @param {typeof THEMES.light} theme
 * @returns {string} SVG markup
 */
function renderBanner(profile, hues, theme) {
	const { width, height, radius } = BANNER;
	const polylines = flowField({ seed: profile.name, width, height, fromX: width * 0.2, lines: 140, steps: 220, stepLength: 3 });
	const stops = hues
		.map(function toStop(hue, index) {
			return `<stop offset="${(0.3 + (index / (hues.length - 1)) * 0.7).toFixed(2)}" stop-color="${accent(hue, theme)}"/>`;
		})
		.join("");
	const visibleAt = visibility(width * 0.22, width * 0.7, [
		[44, 78, profile.name.length * 29 + 24, 64],
		[46, 144, profile.subtitle.length * 10.5 + 60, 32],
	]);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(profile.name)}">
	<defs>
		<clipPath id="clip-banner"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>
		<linearGradient id="hues" gradientUnits="userSpaceOnUse" x1="0" x2="${width}" y1="0" y2="0">${stops}</linearGradient>
	</defs>
	<g clip-path="url(#clip-banner)">
		<rect width="${width}" height="${height}" fill="${theme.surface}"/>
		<g fill="none" stroke="url(#hues)" stroke-width="1.1" stroke-linecap="round">
			${strokes(polylines, visibleAt, theme.opacity + 0.15)}
		</g>
	</g>
	<text x="56" y="128" font-family="${SANS}" font-size="52" font-weight="600" letter-spacing="-1" fill="${theme.text}">${escape(profile.name)}</text>
	${renderFlag(58, 150, theme)}
	<text x="94" y="166" font-family="${SANS}" font-size="20" fill="${theme.muted}">${escape(profile.subtitle)}</text>
</svg>
`;
}

/**
 * Renders the Argentine flag (sky blue, white, sky blue, Sun of May) at 26x18.
 * @param {number} x
 * @param {number} y
 * @param {typeof THEMES.light} theme
 * @returns {string} SVG markup
 */
function renderFlag(x, y, theme) {
	const rays = Array.from({ length: 16 }, function toRay(_, index) {
		const a = (index / 16) * Math.PI * 2;
		return `M${(13 + Math.cos(a) * 2.2).toFixed(2)} ${(9 + Math.sin(a) * 2.2).toFixed(2)}L${(13 + Math.cos(a) * 3.3).toFixed(2)} ${(9 + Math.sin(a) * 3.3).toFixed(2)}`;
	}).join("");
	return `<g transform="translate(${x} ${y})">
		<rect width="26" height="18" rx="2" fill="#74acdf"/>
		<rect y="6" width="26" height="6" fill="#fff"/>
		<path d="${rays}" stroke="#f6b40e" stroke-width="0.8"/>
		<circle cx="13" cy="9" r="1.9" fill="#f6b40e"/>
		<rect x="0.25" y="0.25" width="25.5" height="17.5" rx="1.75" fill="none" stroke="${theme.faint}" stroke-opacity="0.45" stroke-width="0.5"/>
	</g>`;
}

/**
 * Renders a profile link as a bare brand icon.
 * @param {{ label: string, icon: keyof ICONS }} link
 * @param {"light" | "dark"} mode
 * @returns {string} SVG markup
 */
function renderLink(link, mode) {
	const icon = ICONS[link.icon];
	return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" role="img" aria-label="${escape(link.label)}">
	<title>${escape(link.label)}</title>
	<path d="${icon.path}" fill="${icon.color[mode]}"/>
</svg>
`;
}

/**
 * Returns a theme-aware <picture> for a pair of generated images.
 * @param {string} base - Path without the -light/-dark suffix
 * @param {string} alt
 * @param {string} width - HTML width attribute
 * @returns {string}
 */
function picture(base, alt, width) {
	return `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${escape(alt)}" src="${base}-light.svg" width="${width}"></picture>`;
}

/**
 * Renders the README from the profile data.
 * @param {object} data - Parsed projects.json
 * @returns {string}
 */
function renderReadme(data) {
	const { profile, sections } = data;
	const links = profile.links
		.map(function toLink(link) {
			return `<a href="${link.url}" title="${escape(link.label)}">${picture(`assets/links/${link.icon}`, link.label, "24")}</a>`;
		})
		.join("&nbsp;&nbsp;&nbsp;");
	const body = sections.map(function toSection(section) {
		const cards = section.items.map(function toCard(item) {
			return `<a href="${item.url}">${picture(`assets/cards/${slug(item.name)}`, `${item.name}: ${item.description}`, "49%")}</a>`;
		});
		const note = section.note ? `\n\n${section.note}` : "";
		return `### ${section.title}\n\n${cards.join("\n")}${note}`;
	});

	return `<!-- Generated by scripts/generate.mjs from projects.json. Edit those, not this file. -->

${picture("assets/banner", profile.name, "100%")}

${links}

${body.join("\n\n")}
`;
}

/**
 * Turns a project name into a file name.
 * @param {string} name
 * @returns {string}
 */
function slug(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * Writes the README, banner and cards.
 */
function main() {
	const data = JSON.parse(readFileSync(join(ROOT, "projects.json"), "utf8"));
	const hues = data.sections.map(function toHue(section) {
		return section.hue;
	});
	mkdirSync(CARDS_DIR, { recursive: true });
	mkdirSync(join(ROOT, "assets", "links"), { recursive: true });

	for (const [mode, theme] of Object.entries(THEMES)) {
		writeFileSync(join(ROOT, "assets", `banner-${mode}.svg`), renderBanner(data.profile, hues, theme));
		for (const link of data.profile.links) {
			writeFileSync(join(ROOT, "assets", "links", `${link.icon}-${mode}.svg`), renderLink(link, mode));
		}
		for (const section of data.sections) {
			for (const item of section.items) {
				writeFileSync(join(CARDS_DIR, `${slug(item.name)}-${mode}.svg`), renderCard(item, section.hue, theme));
			}
		}
	}

	writeFileSync(join(ROOT, "README.md"), renderReadme(data));
	const count = data.sections.reduce(function sum(total, section) {
		return total + section.items.length;
	}, 0);
	console.log(`README.md, banner and ${count} cards (light + dark) written.`);
}

main();
