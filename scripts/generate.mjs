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
 * Traces streamlines through a seeded flow field and returns them as SVG path data.
 * @param {object} options
 * @param {string} options.seed - Text the field is derived from
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.fromX - Left edge of the area where lines start
 * @param {number} options.lines - Number of streamlines
 * @param {number} options.steps - Integration steps per line
 * @param {number} options.stepLength - Distance per step
 * @returns {string[]}
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

	const paths = [];
	for (let i = 0; i < lines; i++) {
		let x = fromX + rand() * (width - fromX);
		let y = rand() * height;
		const points = [`M${x.toFixed(1)} ${y.toFixed(1)}`];
		for (let step = 0; step < steps; step++) {
			const a = angle(x, y);
			x += Math.cos(a) * stepLength;
			y += Math.sin(a) * stepLength;
			if (x < -20 || x > width + 20 || y < -20 || y > height + 20) break;
			points.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
		}
		if (points.length > 4) paths.push(points.join(""));
	}
	return paths;
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
 * Renders mask content that hides the pattern behind text, with blurred edges so lines fade out around it.
 * @param {string} id - Unique suffix for the filter id
 * @param {Array<[number, number, number, number]>} boxes - Text bounds as [x, y, width, height]
 * @returns {{ filter: string, shapes: string }}
 */
function halos(id, boxes) {
	const rects = boxes
		.map(function toRect([x, y, w, h]) {
			return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${h / 2}"/>`;
		})
		.join("");
	return {
		filter: `<filter id="blur-${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>`,
		shapes: `<g fill="#000" filter="url(#blur-${id})">${rects}</g>`,
	};
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
	const paths = flowField({ seed: item.name, width, height, fromX: width * 0.35, lines: 34, steps: 90, stepLength: 2.6 });
	const lines = wrap(item.description, 52).slice(0, 2);
	const commandWidth = item.command ? (item.command.length + 2) * 7.6 : 0;
	const halo = halos(id, [
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
		<linearGradient id="fade-${id}" x1="0" x2="1" y1="0" y2="0">
			<stop offset="0.35" stop-color="#fff" stop-opacity="0"/>
			<stop offset="1" stop-color="#fff" stop-opacity="1"/>
		</linearGradient>
		${halo.filter}
		<mask id="mask-${id}"><rect width="${width}" height="${height}" fill="url(#fade-${id})"/>${halo.shapes}</mask>
	</defs>
	<g clip-path="url(#clip-${id})">
		<rect width="${width}" height="${height}" fill="${theme.surface}"/>
		<g mask="url(#mask-${id})" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="${theme.opacity}" stroke-linecap="round">
			${paths.map(function toPath(d) {
				return `<path d="${d}"/>`;
			}).join("\n\t\t\t")}
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
	const paths = flowField({ seed: profile.name, width, height, fromX: width * 0.2, lines: 140, steps: 220, stepLength: 3 });
	const stops = hues
		.map(function toStop(hue, index) {
			return `<stop offset="${(0.3 + (index / (hues.length - 1)) * 0.7).toFixed(2)}" stop-color="${accent(hue, theme)}"/>`;
		})
		.join("");
	const halo = halos("banner", [
		[44, 78, profile.name.length * 29 + 24, 64],
		[46, 144, profile.subtitle.length * 10.5 + 60, 32],
	]);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(profile.name)}">
	<defs>
		<clipPath id="clip-banner"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>
		<linearGradient id="hues" gradientUnits="userSpaceOnUse" x1="0" x2="${width}" y1="0" y2="0">${stops}</linearGradient>
		<linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
			<stop offset="0.22" stop-color="#fff" stop-opacity="0"/>
			<stop offset="0.7" stop-color="#fff" stop-opacity="1"/>
		</linearGradient>
		${halo.filter}
		<mask id="mask-banner"><rect width="${width}" height="${height}" fill="url(#fade)"/>${halo.shapes}</mask>
	</defs>
	<g clip-path="url(#clip-banner)">
		<rect width="${width}" height="${height}" fill="${theme.surface}"/>
		<g mask="url(#mask-banner)" fill="none" stroke="url(#hues)" stroke-width="1.1" stroke-opacity="${theme.opacity + 0.15}" stroke-linecap="round">
			${paths.map(function toPath(d) {
				return `<path d="${d}"/>`;
			}).join("\n\t\t\t")}
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
		<clipPath id="flag"><rect width="26" height="18" rx="3"/></clipPath>
		<g clip-path="url(#flag)">
			<rect width="26" height="18" fill="#74acdf"/>
			<rect y="6" width="26" height="6" fill="#fff"/>
			<path d="${rays}" stroke="#f6b40e" stroke-width="0.8"/>
			<circle cx="13" cy="9" r="1.9" fill="#f6b40e"/>
		</g>
		<rect x="0.25" y="0.25" width="25.5" height="17.5" rx="2.75" fill="none" stroke="${theme.faint}" stroke-opacity="0.45" stroke-width="0.5"/>
	</g>`;
}

/**
 * Estimates the rendered width of a label in the system sans at 15px, weight 500.
 * @param {string} text
 * @returns {number}
 */
function labelWidth(text) {
	let total = 0;
	for (const char of text) {
		if ("mwMW".includes(char)) total += 13.2;
		else if ("ilIjtf".includes(char)) total += 4.8;
		else if (char === char.toUpperCase()) total += 10;
		else total += 8.6;
	}
	return total;
}

/**
 * Renders a profile link: brand icon plus label, on a transparent background.
 * @param {{ label: string, icon: keyof ICONS }} link
 * @param {"light" | "dark"} mode
 * @returns {string} SVG markup
 */
function renderLink(link, mode) {
	const icon = ICONS[link.icon];
	const width = Math.ceil(28 + labelWidth(link.label) + 2);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" viewBox="0 0 ${width} 24" role="img" aria-label="${escape(link.label)}">
	<g transform="translate(2 3) scale(0.75)"><path d="${icon.path}" fill="${icon.color[mode]}"/></g>
	<text x="28" y="17" font-family="${SANS}" font-size="15" font-weight="500" fill="${THEMES[mode].text}">${escape(link.label)}</text>
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
	return `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${escape(alt)}" src="${base}-light.svg"${width ? ` width="${width}"` : ""}></picture>`;
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
			return `<a href="${link.url}">${picture(`assets/links/${link.icon}`, link.label, "")}</a>`;
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
