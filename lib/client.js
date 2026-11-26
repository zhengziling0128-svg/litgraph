window.__ModuleLoader__.load({
	id: "dsh-litgraph",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		// src/client/api.ts
		const BASE = "/api/litgraph";
		var ApiError = class extends Error {
			status;
			constructor(message, status) {
				super(message);
				this.name = "ApiError";
				this.status = status;
			}
		};
		function describe$3(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		async function requestJSON(path, init) {
			let response;
			try {
				response = await fetch(BASE + path, init);
			} catch (error) {
				throw new ApiError("无法连接宿主路由（" + describe$3(error) + "）", 0);
			}
			if (!response.ok) {
				let detail = "";
				try {
					detail = (await response.text()).trim().slice(0, 240);
				} catch {}
				throw new ApiError("HTTP " + response.status + (detail ? " · " + detail : ""), response.status);
			}
			try {
				return await response.json();
			} catch (error) {
				throw new ApiError("宿主返回了非法 JSON（" + describe$3(error) + "）", response.status);
			}
		}
		function fetchGraph(signal) {
			return requestJSON("/graph", { signal });
		}
		function fetchStatus(signal) {
			return requestJSON("/status", { signal });
		}
		function fetchPapers(query, signal) {
			const params = new URLSearchParams();
			params.set("sort", query.sort);
			params.set("order", query.order);
			params.set("page", String(query.page));
			params.set("pageSize", String(query.pageSize));
			if (query.q) params.set("q", query.q);
			if (query.cluster) params.set("cluster", query.cluster);
			if (query.tag) params.set("tag", query.tag);
			if (query.starred === true) params.set("starred", "1");
			if (typeof query.minRating === "number" && query.minRating >= 1) params.set("minRating", String(Math.round(query.minRating)));
			return requestJSON("/papers?" + params.toString(), { signal });
		}
		function fetchPaper(id, signal) {
			return requestJSON("/paper?id=" + encodeURIComponent(id), { signal });
		}
		/**
		* PATCH the user-editable fields of one paper (notes / tags / starred / rating).
		* The host clamps rating to an integer 0..5.
		*/
		function updatePaper(id, patch) {
			return requestJSON("/paper", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					id,
					...patch
				})
			});
		}
		/**
		* Open the original attachment of one paper. The host tries the Zotero linked
		* file first and falls back to the stored PDF; the client must never open the
		* file URL itself (the shell decides how to hand it to the OS).
		*/
		function openPaper(id) {
			return requestJSON("/open", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id })
			});
		}
		/**
		* Queue journal-metric lookups (EasyScholar). Omit ids to refresh every paper
		* that has metrics enabled; already-fresh records are counted as skipped.
		*/
		function refreshMetrics(ids, options = {}) {
			const body = {};
			if (ids !== void 0 && ids.length > 0) body.ids = ids;
			if (options.force === true) body.force = true;
			return requestJSON("/metrics/refresh", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
		}
		/** 数据库内论文研究趋势 for one scope (GET /api/litgraph/insight). */
		function fetchInsight(query = {}, signal) {
			const params = new URLSearchParams();
			if (query.scope) params.set("scope", query.scope);
			if (typeof query.clusterId === "string" && query.clusterId !== "") params.set("cluster", query.clusterId);
			if (typeof query.recentYears === "number") params.set("recentYears", String(query.recentYears));
			if (query.refresh === true) params.set("refresh", "1");
			const suffix = params.toString();
			return requestJSON("/insight" + (suffix === "" ? "" : "?" + suffix), { signal });
		}
		function fetchSettings(signal) {
			return requestJSON("/settings", { signal });
		}
		function saveSettings(patch) {
			return requestJSON("/settings", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(patch)
			});
		}
		/**
		* Walk every /papers page for the current filter (used by the BibTeX export).
		* Sorted by title so the page walk is stable while the export runs.
		*/
		async function fetchAllPapers(filters = {}, onProgress, signal) {
			const pageSize = 100;
			const collected = [];
			let total = Number.POSITIVE_INFINITY;
			for (let page = 1; page <= 500 && collected.length < total; page += 1) {
				const data = await fetchPapers({
					sort: filters.sort ?? "title",
					order: filters.order ?? "asc",
					page,
					pageSize,
					q: filters.q ?? "",
					cluster: filters.cluster ?? "",
					tag: filters.tag,
					starred: filters.starred,
					minRating: filters.minRating
				}, signal);
				total = data.total;
				if (data.items.length === 0) break;
				for (const item of data.items) collected.push(item);
				onProgress?.(Math.min(collected.length, total), total);
			}
			return collected.slice(0, Number.isFinite(total) ? total : collected.length);
		}
		/** Load full details for a list of paper ids with bounded concurrency. */
		async function fetchPaperDetails(ids, options = {}) {
			const concurrency = Math.max(1, Math.min(12, options.concurrency ?? 6));
			const results = new Array(ids.length).fill(null);
			let next = 0;
			let done = 0;
			const worker = async () => {
				for (;;) {
					const index = next;
					next += 1;
					if (index >= ids.length) return;
					if (options.signal?.aborted === true) return;
					try {
						results[index] = await fetchPaper(ids[index], options.signal);
					} catch {
						results[index] = null;
					}
					done += 1;
					options.onProgress?.(done, ids.length);
				}
			};
			await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
			return results.filter((paper) => paper !== null);
		}
		function deletePaper(id) {
			return requestJSON("/paper?id=" + encodeURIComponent(id), { method: "DELETE" });
		}
		function fetchJob(id, signal) {
			return requestJSON("/job?id=" + encodeURIComponent(id), { signal });
		}
		async function uploadPaper(file) {
			let response;
			try {
				response = await fetch(BASE + "/upload", {
					method: "POST",
					headers: {
						"content-type": file.type || "application/pdf",
						"x-litgraph-filename": encodeURIComponent(file.name)
					},
					body: file
				});
			} catch (error) {
				throw new ApiError("上传失败：无法连接宿主路由（" + describe$3(error) + "）", 0);
			}
			if (!response.ok) {
				let detail = "";
				try {
					detail = (await response.text()).trim().slice(0, 240);
				} catch {}
				throw new ApiError("上传失败：HTTP " + response.status + (detail ? " · " + detail : ""), response.status);
			}
			return await response.json();
		}
		function isPdf(file) {
			if (file.type === "application/pdf") return true;
			return /\.pdf$/i.test(file.name);
		}
		/** Live Zotero local-API status: collections, availability, whether writes are authorized. */
		function fetchZoteroState() {
			return requestJSON("/zotero/state");
		}
		/** Ask Zotero for a write key; the user confirms in a Zotero modal. */
		function authorizeZotero() {
			return requestJSON("/zotero/authorize", { method: "POST" });
		}
		/** Re-match every paper against the Zotero library (title match) and cache keys/collections. */
		function syncZotero() {
			return requestJSON("/zotero/sync", { method: "POST" });
		}
		/** Replace the paper's Zotero collection membership (writes through to Zotero). */
		function setPaperCollections(id, collections) {
			return requestJSON("/paper/zotero", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					id,
					collections
				})
			});
		}
		// src/client/layout/force.ts
		const WORLD_WIDTH = 1200;
		const WORLD_CX = WORLD_WIDTH / 2;
		const WORLD_CY = 400;
		/** Golden angle: consecutive points of a phyllotaxis spiral. */
		const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
		const FALLBACK_CLUSTER_COLORS = [
			"#ffd166",
			"#f78c6c",
			"#67e8f9",
			"#a78bfa",
			"#34d399",
			"#f472b6",
			"#facc15",
			"#60a5fa"
		];
		function clusterColor(cluster, index) {
			if (cluster && typeof cluster.color === "string" && cluster.color.trim() !== "") return cluster.color;
			return FALLBACK_CLUSTER_COLORS[index % FALLBACK_CLUSTER_COLORS.length];
		}
		function mulberry32(seed) {
			let state = seed >>> 0;
			return function next() {
				state = state + 1831565813 >>> 0;
				let t = state;
				t = Math.imul(t ^ t >>> 15, t | 1);
				t ^= t + Math.imul(t ^ t >>> 7, t | 61);
				return ((t ^ t >>> 14) >>> 0) / 4294967296;
			};
		}
		function clamp$1(value, min, max) {
			return Math.max(min, Math.min(max, value));
		}
		/**
		* Target drawn radius of a constellation: grows with sqrt(count) so the per-node
		* density stays roughly constant from a handful of papers to a thousand.
		*/
		function clusterTargetRadius(count) {
			return 20 + Math.sqrt(Math.max(1, count)) * 27;
		}
		function groupOf(cluster) {
			const group = typeof cluster.group === "string" ? cluster.group.trim() : "";
			if (group !== "") return group;
			const label = cluster.label.split(">")[0].trim();
			return label !== "" ? label : "未分类";
		}
		/** Radius that comfortably wraps the given constellations (area heuristic + largest lobe). */
		function galaxySize(radii) {
			if (radii.length === 0) return 60;
			let sumSquares = 0;
			let maxRadius = 0;
			for (const radius of radii) {
				sumSquares += radius * radius;
				maxRadius = Math.max(maxRadius, radius);
			}
			return Math.sqrt(sumSquares) * .64 + maxRadius * .78 + 26;
		}
		/**
		* Place galaxy discs on a golden-angle spiral, skipping positions that would overlap a
		* disc already placed. Deterministic and good enough for a dozen fields.
		*/
		function packGalaxies(buckets) {
			const placed = [];
			for (const bucket of buckets) {
				if (placed.length === 0) {
					bucket.x = WORLD_CX;
					bucket.y = WORLD_CY;
					placed.push(bucket);
					continue;
				}
				let accepted = false;
				for (let step = 1; step <= 2400; step += 1) {
					const angle = step * GOLDEN_ANGLE;
					const distance = 16 * Math.sqrt(step);
					const x = WORLD_CX + Math.cos(angle) * distance;
					const y = WORLD_CY + Math.sin(angle) * distance * .86;
					let collides = false;
					for (const other of placed) {
						const gap = bucket.radius + other.radius + 64;
						if (Math.hypot(x - other.x, y - other.y) < gap) {
							collides = true;
							break;
						}
					}
					if (collides) continue;
					bucket.x = x;
					bucket.y = y;
					placed.push(bucket);
					accepted = true;
					break;
				}
				if (!accepted) {
					const last = placed[placed.length - 1];
					bucket.x = last.x + last.radius + bucket.radius + 60;
					bucket.y = last.y;
					placed.push(bucket);
				}
			}
		}
		/** Push constellation discs apart inside their galaxy so they never overlap. */
		function relaxClusters(centers, galaxy) {
			const count = centers.length;
			if (count === 0) return;
			if (count === 1) {
				centers[0].x = galaxy.x;
				centers[0].y = galaxy.y;
				return;
			}
			for (let iteration = 0; iteration < 90; iteration += 1) {
				for (let i = 0; i < count; i += 1) for (let j = i + 1; j < count; j += 1) {
					const a = centers[i];
					const b = centers[j];
					let dx = b.x - a.x;
					let dy = b.y - a.y;
					let distance = Math.hypot(dx, dy);
					const minDistance = a.radius + b.radius + 8;
					if (distance >= minDistance) continue;
					if (distance < .01) {
						dx = 1;
						dy = 0;
						distance = 1;
					}
					const push = (minDistance - distance) * .5;
					const ux = dx / distance;
					const uy = dy / distance;
					a.x -= ux * push;
					a.y -= uy * push;
					b.x += ux * push;
					b.y += uy * push;
				}
				for (const center of centers) {
					const dx = center.x - galaxy.x;
					const dy = center.y - galaxy.y;
					const distance = Math.hypot(dx, dy);
					const limit = Math.max(0, galaxy.radius - center.radius - 6);
					if (distance > limit && distance > .01) {
						const scale = limit / distance;
						center.x = galaxy.x + dx * scale;
						center.y = galaxy.y + dy * scale;
					}
				}
			}
		}
		const EMPTY_LAYOUT = {
			nodes: [],
			edges: [],
			byId: /* @__PURE__ */ new Map(),
			clusterCenters: [],
			galaxies: [],
			seed: 1
		};
		function computeLayout(input) {
			const { nodes, edges, clusters } = input;
			if (nodes.length === 0) return {
				...EMPTY_LAYOUT,
				seed: input.seed ?? 1
			};
			const seed = input.seed ?? 7;
			const random = mulberry32(seed * 2654435761);
			const colorByCluster = /* @__PURE__ */ new Map();
			clusters.forEach((cluster, index) => colorByCluster.set(cluster.id, clusterColor(cluster, index)));
			const countByCluster = /* @__PURE__ */ new Map();
			for (const node of nodes) countByCluster.set(node.clusterId, (countByCluster.get(node.clusterId) ?? 0) + 1);
			const clusterById = /* @__PURE__ */ new Map();
			for (const cluster of clusters) clusterById.set(cluster.id, cluster);
			for (const node of nodes) {
				if (clusterById.has(node.clusterId)) continue;
				const label = node.clusterLabel || "未分类";
				clusterById.set(node.clusterId, {
					id: node.clusterId,
					label,
					color: FALLBACK_CLUSTER_COLORS[clusterById.size % FALLBACK_CLUSTER_COLORS.length],
					group: label.split(">")[0].trim() || "未分类"
				});
			}
			const activeClusters = [...clusterById.values()].filter((cluster) => (countByCluster.get(cluster.id) ?? 0) > 0);
			const bucketByGroup = /* @__PURE__ */ new Map();
			for (const cluster of activeClusters) {
				const group = groupOf(cluster);
				let bucket = bucketByGroup.get(group);
				if (!bucket) {
					bucket = {
						group,
						clusters: [],
						count: 0,
						color: clusterColor(cluster, bucketByGroup.size),
						radius: 0,
						x: WORLD_CX,
						y: WORLD_CY
					};
					bucketByGroup.set(group, bucket);
				}
				bucket.clusters.push(cluster);
				bucket.count += countByCluster.get(cluster.id) ?? 0;
				if (bucket.color === FALLBACK_CLUSTER_COLORS[0] && typeof cluster.color === "string" && cluster.color.trim() !== "") bucket.color = cluster.color;
			}
			const buckets = [...bucketByGroup.values()].sort((a, b) => b.count - a.count || a.group.localeCompare(b.group, "zh-Hans-CN"));
			for (const bucket of buckets) bucket.radius = galaxySize(bucket.clusters.map((cluster) => clusterTargetRadius(countByCluster.get(cluster.id) ?? 1)));
			packGalaxies(buckets);
			const centerByCluster = /* @__PURE__ */ new Map();
			for (const bucket of buckets) {
				const list = bucket.clusters.map((cluster) => ({
					cluster,
					x: 0,
					y: 0,
					count: countByCluster.get(cluster.id) ?? 0,
					radius: clusterTargetRadius(countByCluster.get(cluster.id) ?? 1)
				})).sort((a, b) => b.count - a.count || a.cluster.label.localeCompare(b.cluster.label, "zh-Hans-CN"));
				const phase = random() * Math.PI * 2;
				list.forEach((center, index) => {
					if (list.length === 1) {
						center.x = bucket.x;
						center.y = bucket.y;
						return;
					}
					const distance = Math.max(20, bucket.radius - center.radius - 4) * Math.sqrt((index + .4) / list.length);
					const angle = index * GOLDEN_ANGLE + phase;
					center.x = bucket.x + Math.cos(angle) * distance;
					center.y = bucket.y + Math.sin(angle) * distance * .9;
				});
				relaxClusters(list, bucket);
				for (const center of list) centerByCluster.set(center.cluster.id, center);
			}
			for (let pass = 0; pass < 2; pass += 1) {
				const before = new Map(buckets.map((bucket) => [bucket.group, {
					x: bucket.x,
					y: bucket.y
				}]));
				for (const bucket of buckets) {
					let radius = 40;
					for (const cluster of bucket.clusters) {
						const center = centerByCluster.get(cluster.id);
						if (!center) continue;
						radius = Math.max(radius, Math.hypot(center.x - bucket.x, center.y - bucket.y) + center.radius);
					}
					bucket.radius = Math.max(bucket.radius, radius + 26);
				}
				packGalaxies(buckets);
				for (const bucket of buckets) {
					const previous = before.get(bucket.group);
					if (!previous) continue;
					const dx = bucket.x - previous.x;
					const dy = bucket.y - previous.y;
					if (dx === 0 && dy === 0) continue;
					for (const cluster of bucket.clusters) {
						const center = centerByCluster.get(cluster.id);
						if (!center) continue;
						center.x += dx;
						center.y += dy;
					}
				}
			}
			const densityBoost = clamp$1(Math.sqrt(nodes.length / 240), 1, 1.8);
			const positionedNodes = nodes.map((node) => {
				const center = centerByCluster.get(node.clusterId);
				const radius = clamp$1((3.6 + Math.sqrt(Math.max(0, node.degree) + 1) * 1.5) * densityBoost, 3, 16);
				if (!center) return {
					...node,
					x: WORLD_CX,
					y: WORLD_CY,
					radius
				};
				const phase = (node.clusterId.charCodeAt(1) ?? 7) % 17 * .37;
				const angle = (node.degree * .9 + phase) % (Math.PI * 2);
				const distance = center.radius * .86 * Math.sqrt(random());
				return {
					...node,
					x: center.x + Math.cos(angle) * distance,
					y: center.y + Math.sin(angle) * distance * .94,
					radius
				};
			});
			new Map(positionedNodes.map((node) => [node.id, node]));
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const bucket of buckets) {
				minX = Math.min(minX, bucket.x - bucket.radius);
				maxX = Math.max(maxX, bucket.x + bucket.radius);
				minY = Math.min(minY, bucket.y - bucket.radius);
				maxY = Math.max(maxY, bucket.y + bucket.radius);
			}
			const skyWidth = Math.max(1, maxX - minX);
			const skyHeight = Math.max(1, maxY - minY);
			const fit = Math.min(1, 1044 / skyWidth, 644 / skyHeight);
			minX = minX * fit;
			minY = minY * fit;
			const offsetX = WORLD_CX - (minX + maxX * fit) / 2;
			const offsetY = WORLD_CY - (minY + maxY * fit) / 2;
			const positioned = positionedNodes.map((node) => ({
				...node,
				x: Math.round((node.x * fit + offsetX) * 10) / 10,
				y: Math.round((node.y * fit + offsetY) * 10) / 10
			}));
			const finalById = new Map(positioned.map((node) => [node.id, node]));
			const clusterCenters = [];
			for (const bucket of buckets) for (const cluster of bucket.clusters) {
				const members = positioned.filter((node) => node.clusterId === cluster.id);
				if (members.length === 0) continue;
				const x = members.reduce((sum, node) => sum + node.x, 0) / members.length;
				const y = members.reduce((sum, node) => sum + node.y, 0) / members.length;
				let radius = 34;
				for (const node of members) radius = Math.max(radius, Math.hypot(node.x - x, node.y - y) + node.radius + 6);
				clusterCenters.push({
					cluster,
					x: Math.round(x * 10) / 10,
					y: Math.round(y * 10) / 10,
					count: members.length,
					radius: Math.round(radius)
				});
			}
			const galaxies = buckets.map((bucket) => {
				const centers = clusterCenters.filter((center) => groupOf(center.cluster) === bucket.group);
				if (centers.length === 0) return {
					group: bucket.group,
					label: bucket.group,
					color: bucket.color,
					x: Math.round(bucket.x * fit + offsetX),
					y: Math.round(bucket.y * fit + offsetY),
					radius: Math.round(bucket.radius * fit),
					count: bucket.count
				};
				const total = centers.reduce((sum, center) => sum + center.count, 0);
				let x = 0;
				let y = 0;
				for (const center of centers) {
					x += center.x * center.count;
					y += center.y * center.count;
				}
				x /= Math.max(1, total);
				y /= Math.max(1, total);
				let radius = 40;
				for (const center of centers) radius = Math.max(radius, Math.hypot(center.x - x, center.y - y) + center.radius);
				return {
					group: bucket.group,
					label: bucket.group,
					color: bucket.color,
					x: Math.round(x * 10) / 10,
					y: Math.round(y * 10) / 10,
					radius: Math.round(radius + 22),
					count: bucket.count
				};
			});
			return {
				nodes: positioned,
				edges: edges.map((edge) => {
					const source = finalById.get(edge.source);
					const target = finalById.get(edge.target);
					if (!source || !target) return null;
					const dx = target.x - source.x;
					const dy = target.y - source.y;
					const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
					const bend = ((edge.source.charCodeAt(0) + edge.target.charCodeAt(0) + edge.source.length) % 2 === 0 ? 1 : -1) * distance * .1;
					const mx = (source.x + target.x) / 2 - dy / distance * bend;
					const my = (source.y + target.y) / 2 + dx / distance * bend;
					const color = colorByCluster.get(source.clusterId) ?? FALLBACK_CLUSTER_COLORS[0];
					return {
						id: edge.source + "→" + edge.target + ":" + edge.kind,
						source: edge.source,
						target: edge.target,
						kind: edge.kind,
						weight: edge.weight,
						path: "M" + source.x + "," + source.y + " Q" + mx + "," + my + " " + target.x + "," + target.y,
						color,
						opacity: edge.kind === "category" ? .14 + Math.min(.24, edge.weight * .18) : .09 + Math.min(.15, edge.weight * .11)
					};
				}).filter((edge) => edge !== null),
				byId: finalById,
				clusterCenters,
				galaxies,
				seed
			};
		}
		/** Deterministic star field for the empty space behind the constellations. */
		function makeStars(seed, count) {
			const random = mulberry32((seed + 1013) * 7919);
			const stars = [];
			for (let index = 0; index < count; index += 1) {
				const bright = random();
				stars.push({
					x: Math.round(random() * WORLD_WIDTH * 10) / 10,
					y: Math.round(random() * 800 * 10) / 10,
					radius: bright > .94 ? 1.9 : bright > .72 ? 1.15 : .7,
					opacity: .14 + bright * .55,
					delay: Math.round(random() * 6e3)
				});
			}
			return stars;
		}
		// src/client/types.ts
		const SORT_OPTIONS = [
			{
				value: "updatedAt",
				label: "修改时间"
			},
			{
				value: "title",
				label: "标题"
			},
			{
				value: "year",
				label: "年份"
			},
			{
				value: "addedAt",
				label: "加入时间"
			},
			{
				value: "rating",
				label: "评分（高→低）"
			}
		];
		const STATUS_LABEL = {
			processing: "解析中",
			ready: "已入库",
			failed: "失败"
		};
		const JOB_STATE_LABEL = {
			queued: "排队中",
			parsing: "解析 PDF",
			extracting: "AI 理解",
			graphing: "更新图谱",
			done: "完成",
			failed: "失败"
		};
		const TAXONOMY_MODE_OPTIONS = [{
			value: "free",
			label: "自由生长",
			hint: "AI 按论文主题自行提出新类目，类目会随文献增长"
		}, {
			value: "fixed",
			label: "固定学科目录",
			hint: "只从内置中文三级学科目录中选择，类目稳定、便于跨库对比"
		}];
		const OCR_ENGINE_OPTIONS = [
			{
				value: "auto",
				label: "自动（推荐）",
				hint: "扫描件先交给模型视觉逐页转录，模型不可用时退回 Windows 本地 OCR"
			},
			{
				value: "model",
				label: "模型视觉",
				hint: "每页一次模型调用，英文、公式、双栏排版更准，耗时和 token 更多"
			},
			{
				value: "windows",
				label: "本地 OCR",
				hint: "免费且快，但本机只有中文识别器，英文扫描件准确率较低"
			}
		];
		// src/client/styles.ts
		/**
		* LitGraph workbench stylesheet.
		*
		* Theme independence is the point of this file: the panel used to borrow the shell's
		* label colours (`--dsw-alias-label-*`), so a light shell skin painted dark ink on our
		* dark starry surface ("背景和字都是黑的看不清"). Instead both palettes are declared
		* here as self-contained `--lg-*` tokens, selected with `.lg-root[data-lg-theme]`, and
		* only neutral things (font stack, radii) still come from the shell.
		*
		* The font step (14 / 15 / 16px, persisted by theme.ts) scales every text size through
		* `--lg-fs-scale`; the panel widths scale with `--lg-layout-scale` so the three columns
		* keep breathing room when the type grows.
		*
		* The client bundle has no CSS pipeline: the stylesheet is injected once as a
		* <style data-plugin="dsh-litgraph"> element from apply(ctx) and removed on disposal.
		*/
		const STYLE_ID = "dsh-litgraph-styles";
		const CSS = String.raw`
/* ================= design tokens: layout, type scale, palettes ================= */
.lg-root {
  --lg-font: ${"var(--dsw-font-family, var(--dsh-font-family-text, \"Noto Sans SC\", \"PingFang SC\", system-ui, -apple-system, \"Segoe UI\", sans-serif))"};
  --lg-fs-scale: 1;
  --lg-layout-scale: 1;
  --lg-detail-width: calc(330px * var(--lg-layout-scale));
  --lg-library-width: calc(350px * var(--lg-layout-scale));
  --lg-radius-sm: var(--dsw-radius-sm, 8px);
  --lg-radius: var(--dsw-radius-md, 10px);
  --lg-radius-lg: var(--dsw-radius-lg, 14px);

  /* dark palette (default) */
  --lg-bg-top: #0c1426;
  --lg-bg-mid: #0a1020;
  --lg-bg-bottom: #070c18;
  --lg-glow-1: rgba(96, 138, 214, 0.22);
  --lg-glow-2: rgba(128, 92, 204, 0.18);
  --lg-panel: rgba(10, 16, 30, 0.96);
  --lg-panel-solid: #0b1222;
  --lg-panel-raised: #121c30;
  --lg-header-bg: linear-gradient(180deg, rgba(11, 18, 34, 0.98), rgba(9, 14, 26, 0.92));
  --lg-border: rgba(126, 156, 206, 0.26);
  --lg-border-strong: rgba(150, 186, 244, 0.46);
  --lg-text: #dfe7f5;
  --lg-muted: #a8b6cf;
  --lg-dim: #7d8ca8;
  --lg-accent: #ffd166;
  --lg-accent-soft: rgba(255, 209, 102, 0.16);
  --lg-accent-text: #ffe2a1;
  --lg-accent-border: rgba(255, 209, 102, 0.44);
  --lg-cyan: #7fd1ff;
  --lg-cyan-soft: rgba(127, 209, 255, 0.15);
  --lg-cyan-border: rgba(127, 209, 255, 0.4);
  --lg-danger: #ff8a9d;
  --lg-danger-soft: rgba(255, 122, 144, 0.1);
  --lg-danger-border: rgba(255, 122, 144, 0.4);
  --lg-success: #55dda4;
  --lg-success-soft: rgba(72, 213, 151, 0.12);
  --lg-success-border: rgba(72, 213, 151, 0.4);
  --lg-warn: #ffc06b;
  --lg-warn-soft: rgba(255, 180, 84, 0.1);
  --lg-warn-border: rgba(255, 180, 84, 0.38);
  --lg-input-bg: rgba(13, 21, 40, 0.94);
  --lg-input-bg-focus: rgba(16, 26, 48, 0.98);
  --lg-input-border: rgba(126, 156, 206, 0.3);
  --lg-btn-bg: rgba(22, 33, 56, 0.9);
  --lg-btn-bg-hover: rgba(36, 52, 82, 0.96);
  --lg-hover: rgba(34, 49, 78, 0.6);
  --lg-selected-bg: rgba(127, 209, 255, 0.12);
  --lg-selected-border: rgba(127, 209, 255, 0.4);
  --lg-chip-bg: rgba(127, 209, 255, 0.08);
  --lg-clear-bg: rgba(148, 172, 210, 0.16);
  --lg-clear-bg-hover: rgba(148, 172, 210, 0.3);
  --lg-tooltip-bg: rgba(8, 14, 27, 0.98);
  --lg-toast-bg: rgba(9, 16, 30, 0.98);
  --lg-legend-bg: rgba(9, 15, 28, 0.82);
  --lg-hud-bg: rgba(10, 17, 32, 0.82);
  --lg-drop-bg: rgba(7, 14, 28, 0.78);
  --lg-drop-card-bg: rgba(9, 16, 32, 0.94);
  --lg-error-bg: rgba(46, 16, 26, 0.94);
  --lg-warn-bg: rgba(38, 26, 10, 0.88);
  --lg-shadow: rgba(0, 0, 0, 0.55);
  --lg-shadow-strong: rgba(0, 0, 0, 0.66);
  --lg-selection: rgba(255, 209, 102, 0.28);
  --lg-scrollbar: rgba(148, 172, 210, 0.38);
  --lg-scrollbar-hover: rgba(174, 198, 236, 0.56);
  --lg-skeleton-lo: rgba(148, 172, 210, 0.08);
  --lg-skeleton-hi: rgba(148, 172, 210, 0.2);
  --lg-star: #cfe0ff;
  --lg-graph-bg: radial-gradient(900px 520px at 50% 40%, rgba(34, 54, 94, 0.42), transparent 70%);
  --lg-nebula-opacity: 0.22;
  --lg-nebula-blend: normal;
  --lg-cluster-label-halo: rgba(4, 8, 18, 0.65);
  --lg-node-label: #dbe7fa;
  --lg-node-label-halo: rgba(5, 9, 18, 0.94);
  --lg-node-stroke: rgba(4, 8, 18, 0.55);
  --lg-node-stroke-selected: #ffffff;
  --lg-mark-bg: radial-gradient(60% 60% at 50% 40%, rgba(255, 209, 102, 0.2), rgba(255, 209, 102, 0.04));
  --lg-mark-border: rgba(255, 209, 102, 0.28);
  --lg-mark-glow: rgba(255, 209, 102, 0.35);
  --lg-ring: var(--lg-cyan);

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color-scheme: dark;
  container-type: inline-size;
  color: var(--lg-text);
  font-family: var(--lg-font);
  font-size: calc(14px * var(--lg-fs-scale));
  line-height: 1.52;
  background:
    radial-gradient(1200px 620px at 72% -10%, var(--lg-glow-1), transparent 62%),
    radial-gradient(900px 520px at 8% 112%, var(--lg-glow-2), transparent 60%),
    linear-gradient(180deg, var(--lg-bg-top) 0%, var(--lg-bg-mid) 48%, var(--lg-bg-bottom) 100%);
  outline: none;
}
.lg-root[data-lg-font='15'] { --lg-fs-scale: 1.0714; --lg-layout-scale: 1.045; }
.lg-root[data-lg-font='16'] { --lg-fs-scale: 1.1429; --lg-layout-scale: 1.09; }
.lg-root[data-lg-theme='dark'] { color-scheme: dark; }

/* ---- light / paper palette ---- */
.lg-root[data-lg-theme='light'] {
  color-scheme: light;
  --lg-bg-top: #f8fafd;
  --lg-bg-mid: #eef2f8;
  --lg-bg-bottom: #e5ebf4;
  --lg-glow-1: rgba(160, 190, 235, 0.4);
  --lg-glow-2: rgba(255, 214, 140, 0.22);
  --lg-panel: rgba(255, 255, 255, 0.94);
  --lg-panel-solid: #ffffff;
  --lg-panel-raised: #f5f8fd;
  --lg-header-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(244, 247, 252, 0.93));
  --lg-border: #d3dbe8;
  --lg-border-strong: #a9b8ce;
  --lg-text: #1b2537;
  --lg-muted: #566480;
  --lg-dim: #69758f;
  --lg-accent: #9a6b00;
  --lg-accent-soft: rgba(217, 155, 0, 0.14);
  --lg-accent-text: #6b4a00;
  --lg-accent-border: rgba(154, 107, 0, 0.42);
  --lg-cyan: #1f6a8f;
  --lg-cyan-soft: rgba(31, 106, 143, 0.12);
  --lg-cyan-border: rgba(31, 106, 143, 0.38);
  --lg-danger: #b02a45;
  --lg-danger-soft: rgba(176, 42, 69, 0.08);
  --lg-danger-border: rgba(176, 42, 69, 0.35);
  --lg-success: #0f7a4f;
  --lg-success-soft: rgba(15, 122, 79, 0.1);
  --lg-success-border: rgba(15, 122, 79, 0.35);
  --lg-warn: #8a5a00;
  --lg-warn-soft: rgba(185, 132, 20, 0.12);
  --lg-warn-border: rgba(154, 107, 0, 0.34);
  --lg-input-bg: rgba(255, 255, 255, 0.92);
  --lg-input-bg-focus: #ffffff;
  --lg-input-border: #cbd6e4;
  --lg-btn-bg: rgba(246, 249, 253, 0.95);
  --lg-btn-bg-hover: #e7eef8;
  --lg-hover: rgba(31, 106, 143, 0.08);
  --lg-selected-bg: rgba(31, 106, 143, 0.1);
  --lg-selected-border: rgba(31, 106, 143, 0.4);
  --lg-chip-bg: rgba(31, 106, 143, 0.08);
  --lg-clear-bg: rgba(95, 117, 148, 0.14);
  --lg-clear-bg-hover: rgba(95, 117, 148, 0.26);
  --lg-tooltip-bg: rgba(255, 255, 255, 0.99);
  --lg-toast-bg: rgba(255, 255, 255, 0.99);
  --lg-legend-bg: rgba(255, 255, 255, 0.84);
  --lg-hud-bg: rgba(255, 255, 255, 0.84);
  --lg-drop-bg: rgba(238, 242, 248, 0.85);
  --lg-drop-card-bg: rgba(255, 255, 255, 0.96);
  --lg-error-bg: rgba(255, 240, 243, 0.97);
  --lg-warn-bg: rgba(255, 246, 230, 0.96);
  --lg-shadow: rgba(37, 56, 88, 0.18);
  --lg-shadow-strong: rgba(37, 56, 88, 0.26);
  --lg-selection: rgba(255, 209, 102, 0.38);
  --lg-scrollbar: rgba(95, 117, 148, 0.38);
  --lg-scrollbar-hover: rgba(70, 92, 124, 0.55);
  --lg-skeleton-lo: rgba(120, 140, 170, 0.1);
  --lg-skeleton-hi: rgba(120, 140, 170, 0.22);
  --lg-star: rgba(96, 115, 145, 0.52);
  --lg-graph-bg: radial-gradient(900px 520px at 50% 40%, rgba(188, 207, 234, 0.55), transparent 72%);
  --lg-nebula-opacity: 0.16;
  --lg-nebula-blend: multiply;
  --lg-cluster-label-halo: rgba(255, 255, 255, 0.92);
  --lg-node-label: #1b2537;
  --lg-node-label-halo: rgba(255, 255, 255, 0.94);
  --lg-node-stroke: rgba(255, 255, 255, 0.85);
  --lg-node-stroke-selected: #1b2537;
  --lg-mark-bg: radial-gradient(60% 60% at 50% 40%, rgba(217, 155, 0, 0.18), rgba(217, 155, 0, 0.04));
  --lg-mark-border: rgba(154, 107, 0, 0.3);
  --lg-mark-glow: rgba(154, 107, 0, 0.35);
  --lg-ring: var(--lg-cyan);
}

.lg-root *, .lg-root *::before, .lg-root *::after { box-sizing: border-box; }
.lg-root ::selection { background: var(--lg-selection); }
.lg-root button, .lg-root input, .lg-root select, .lg-root a, .lg-root textarea { font: inherit; }
.lg-root :focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 2px; }

/* ---------- scrollbars ---------- */
.lg-scroll { scrollbar-width: thin; scrollbar-color: var(--lg-scrollbar) transparent; }
.lg-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
.lg-scroll::-webkit-scrollbar-track { background: transparent; }
.lg-scroll::-webkit-scrollbar-thumb { background: var(--lg-scrollbar); border-radius: 8px; }
.lg-scroll::-webkit-scrollbar-thumb:hover { background: var(--lg-scrollbar-hover); }
.lg-scroll-x { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.lg-scroll-x::-webkit-scrollbar { height: 0; }

/* ---------- header / search ---------- */
.lg-header {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  padding: 10px 16px;
  border-bottom: 1px solid var(--lg-border);
  background: var(--lg-header-bg);
}
.lg-brand { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; user-select: none; }
.lg-brand-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 9px;
  color: var(--lg-accent);
  border: 1px solid var(--lg-mark-border);
  background: var(--lg-mark-bg);
  filter: drop-shadow(0 0 8px var(--lg-mark-glow));
}
.lg-brand-text { display: flex; flex-direction: column; line-height: 1.16; }
.lg-brand-name { font-weight: 700; letter-spacing: 0.5px; font-size: calc(15px * var(--lg-fs-scale)); }
.lg-brand-sub { font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); letter-spacing: 0.4px; white-space: nowrap; }

.lg-search { position: relative; flex: 1 1 auto; max-width: 660px; min-width: 150px; }
.lg-search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--lg-dim); pointer-events: none; display: inline-flex; }
.lg-search-input {
  width: 100%; height: 38px; padding: 0 96px 0 36px;
  border-radius: 999px;
  border: 1px solid var(--lg-input-border);
  background: var(--lg-input-bg);
  color: var(--lg-text);
  outline: none;
  appearance: none;
  transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
}
.lg-search-input::-webkit-search-cancel-button { display: none; }
.lg-search-input::placeholder { color: var(--lg-dim); }
.lg-search-input:hover { border-color: var(--lg-border-strong); }
.lg-search-input:focus { border-color: var(--lg-cyan); box-shadow: 0 0 0 3px var(--lg-cyan-soft); background: var(--lg-input-bg-focus); }
.lg-search-clear {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border: 0; border-radius: 50%;
  background: var(--lg-clear-bg); color: var(--lg-muted); cursor: pointer;
}
.lg-search-clear:hover { background: var(--lg-clear-bg-hover); color: var(--lg-text); }
.lg-search-count { position: absolute; right: 37px; top: 50%; transform: translateY(-50%); font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); pointer-events: none; white-space: nowrap; }
.lg-suggest {
  position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 7px);
  border-radius: var(--lg-radius); overflow: hidden;
  border: 1px solid var(--lg-border-strong);
  background: var(--lg-panel-solid);
  box-shadow: 0 18px 44px var(--lg-shadow);
}
.lg-suggest-row {
  display: flex; align-items: baseline; gap: 8px; width: 100%;
  padding: 9px 12px; border: 0; background: transparent; color: var(--lg-text);
  text-align: left; cursor: pointer;
}
.lg-suggest-row:hover, .lg-suggest-row.is-active { background: var(--lg-cyan-soft); }
.lg-suggest-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(13.5px * var(--lg-fs-scale)); }
.lg-suggest-meta { flex: 0 0 auto; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }

.lg-header-meta { display: flex; align-items: center; gap: 8px; margin-left: auto; flex: 0 0 auto; }
.lg-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 999px; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-muted);
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg); white-space: nowrap;
}
.lg-badge i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
.lg-badge.is-online { color: var(--lg-success); border-color: var(--lg-success-border); }
.lg-badge.is-offline { color: var(--lg-warn); border-color: var(--lg-warn-border); }
.lg-meta-text { font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }
.lg-icon-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; min-width: 32px; min-height: 32px; padding: 0 9px;
  border: 1px solid var(--lg-border);
  border-radius: var(--lg-radius-sm);
  background: var(--lg-btn-bg); color: var(--lg-muted); cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.lg-icon-btn:hover { background: var(--lg-btn-bg-hover); color: var(--lg-text); border-color: var(--lg-border-strong); }
.lg-icon-btn:active { background: var(--lg-btn-bg-hover); }
.lg-theme-btn { gap: 7px; padding: 0 10px; }
.lg-theme-text { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1; }
.lg-theme-btn:hover .lg-theme-text { color: var(--lg-text); }
.lg-font-btn { gap: 4px; padding: 0 8px; }
.lg-font-glyph { font-size: calc(12px * var(--lg-fs-scale)); font-weight: 700; letter-spacing: 0.2px; line-height: 1; }
.lg-font-value { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1; }
.lg-font-btn:hover .lg-font-value { color: var(--lg-text); }
.lg-mobile-toggle { display: none; }

/* ---------- columns ---------- */
.lg-columns { position: relative; display: flex; flex: 1 1 auto; min-height: 0; }
.lg-col-detail {
  position: relative; display: flex; flex-direction: column; min-height: 0;
  width: var(--lg-detail-width); flex: 0 0 auto;
  border-right: 1px solid var(--lg-border);
  background: var(--lg-panel);
  z-index: 12;
}
.lg-col-center { position: relative; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.lg-col-library {
  position: relative; display: flex; flex-direction: column; min-height: 0;
  width: var(--lg-library-width); flex: 0 0 auto;
  border-left: 1px solid var(--lg-border);
  background: var(--lg-panel);
  z-index: 12;
}

/* ---------- detail panel ---------- */
.lg-detail { height: 100%; overflow-y: auto; padding: 16px 16px 20px; display: flex; flex-direction: column; gap: 13px; }
.lg-detail-eyebrow { display: flex; align-items: center; gap: 8px; font-size: calc(11.5px * var(--lg-fs-scale)); letter-spacing: 0.9px; text-transform: uppercase; color: var(--lg-dim); }
.lg-detail-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 8px currentColor; }
.lg-detail-year { margin-left: auto; letter-spacing: normal; }
.lg-detail-title { margin: 0; font-size: calc(17px * var(--lg-fs-scale)); line-height: 1.35; font-weight: 650; color: var(--lg-text); }
.lg-detail-sub { font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1.6; }
.lg-detail-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lg-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px; font-size: calc(11.5px * var(--lg-fs-scale));
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg); color: var(--lg-muted);
  white-space: nowrap;
}
.lg-chip-cluster { background: var(--lg-chip-bg); }
.lg-chip-warn { color: var(--lg-warn); border-color: var(--lg-warn-border); background: var(--lg-warn-soft); }
.lg-chip-danger { color: var(--lg-danger); border-color: var(--lg-danger-border); background: var(--lg-danger-soft); }
.lg-detail-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.lg-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; min-height: 32px; padding: 0 12px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border);
  background: var(--lg-btn-bg); color: var(--lg-text); cursor: pointer;
  font-size: calc(13px * var(--lg-fs-scale)); text-decoration: none; white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}
.lg-btn:hover { background: var(--lg-btn-bg-hover); border-color: var(--lg-border-strong); }
.lg-btn:active { transform: translateY(1px); }
.lg-btn[disabled] { opacity: 0.42; cursor: not-allowed; transform: none; }
.lg-btn-primary { background: var(--lg-accent-soft); border-color: var(--lg-accent-border); color: var(--lg-accent-text); }
.lg-btn-primary:hover { background: var(--lg-accent-soft); filter: brightness(1.15); }
.lg-btn-danger { color: var(--lg-danger); border-color: var(--lg-danger-border); background: var(--lg-danger-soft); }
.lg-btn-danger:hover { background: var(--lg-danger-soft); filter: brightness(1.12); }
.lg-btn-ghost { background: transparent; }
.lg-btn-sm { height: 30px; min-height: 30px; padding: 0 10px; font-size: calc(12.5px * var(--lg-fs-scale)); }
.lg-detail-note {
  display: flex; align-items: flex-start; gap: 7px; padding: 9px 11px;
  border-radius: var(--lg-radius-sm); font-size: calc(12px * var(--lg-fs-scale)); line-height: 1.55;
  color: var(--lg-warn); background: var(--lg-warn-soft); border: 1px solid var(--lg-warn-border);
}
.lg-detail-section { display: flex; flex-direction: column; gap: 6px; }
.lg-detail-section h3 {
  margin: 0; display: flex; align-items: center; gap: 8px;
  font-size: calc(11.5px * var(--lg-fs-scale)); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--lg-dim);
}
.lg-detail-section h3::after { content: ''; flex: 1 1 auto; height: 1px; background: linear-gradient(90deg, var(--lg-border), transparent); }
.lg-detail-prose { margin: 0; font-size: calc(13.5px * var(--lg-fs-scale)); line-height: 1.65; color: var(--lg-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.lg-detail-bullets { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.lg-detail-bullets li { font-size: calc(13.5px * var(--lg-fs-scale)); line-height: 1.65; color: var(--lg-muted); }
.lg-meta-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0; font-size: calc(12.5px * var(--lg-fs-scale)); }
.lg-meta-grid dt { color: var(--lg-dim); }
.lg-meta-grid dd { margin: 0; color: var(--lg-muted); text-align: right; overflow-wrap: anywhere; }
.lg-detail-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; height: 100%; padding: 24px 16px; text-align: center; }
.lg-detail-empty-title { color: var(--lg-muted); font-size: calc(14px * var(--lg-fs-scale)); }
.lg-detail-empty-hint { font-size: calc(12.5px * var(--lg-fs-scale)); line-height: 1.75; color: var(--lg-dim); max-width: 240px; }

/* ---------- skeleton ---------- */
.lg-skeleton {
  border-radius: var(--lg-radius-sm);
  background: linear-gradient(100deg, var(--lg-skeleton-lo) 20%, var(--lg-skeleton-hi) 42%, var(--lg-skeleton-lo) 64%);
  background-size: 240% 100%;
  animation: lg-shimmer 1.5s ease-in-out infinite;
}
@keyframes lg-shimmer { 0% { background-position: 140% 0; } 100% { background-position: -40% 0; } }
.lg-detail-skeleton { display: flex; flex-direction: column; gap: 10px; }
.lg-skeleton-eyebrow { width: 46%; height: 10px; }
.lg-skeleton-title { width: 96%; height: 17px; }
.lg-skeleton-title-short { width: 70%; }
.lg-skeleton-line { width: 100%; height: 12px; }
.lg-skeleton-line-short { width: 62%; }
.lg-skeleton-block { width: 100%; height: 104px; }
.lg-skeleton-row { height: 50px; margin-bottom: 4px; }

/* ---------- star map ---------- */
.lg-graph { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; touch-action: none; cursor: grab; background: var(--lg-graph-bg); }
.lg-graph-dragging { cursor: grabbing; }
.lg-graph-svg { position: absolute; inset: 0; display: block; }
.lg-graph-svg text { user-select: none; }
.lg-stars { pointer-events: none; }
.lg-star { fill: var(--lg-star); animation: lg-twinkle 7s ease-in-out infinite; }
.lg-nebula { pointer-events: none; opacity: var(--lg-nebula-opacity); mix-blend-mode: var(--lg-nebula-blend); filter: blur(38px); }
.lg-cluster-label {
  font-size: var(--lg-graph-cluster-size);
  font-weight: 650;
  letter-spacing: 1.4px;
  opacity: 0.82;
  paint-order: stroke;
  stroke: var(--lg-cluster-label-halo);
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}
.lg-cluster-captions { position: absolute; z-index: 2; inset: 0; overflow: hidden; pointer-events: none; }
.lg-cluster-caption {
  position: absolute;
  transform: translate(-50%, -100%);
  font-weight: 650;
  letter-spacing: 1.4px;
  opacity: 0.82;
  white-space: nowrap;
  paint-order: stroke;
  text-shadow: 0 0 10px var(--lg-cluster-label-halo), 0 0 4px var(--lg-cluster-label-halo);
}
.lg-galaxy-nebula {
  pointer-events: none;
  opacity: 0.14;
  mix-blend-mode: var(--lg-nebula-blend);
  filter: blur(64px);
}
.lg-galaxy-caption {
  position: absolute;
  transform: translate(-50%, -100%);
  font-weight: 700;
  letter-spacing: 2.4px;
  opacity: 0.8;
  white-space: nowrap;
  paint-order: stroke;
  text-shadow: 0 0 14px var(--lg-cluster-label-halo, rgba(4, 8, 18, 0.6)), 0 0 5px var(--lg-cluster-label-halo, rgba(4, 8, 18, 0.6));
}
.lg-edge { fill: none; pointer-events: none; transition: opacity 160ms ease; }
.lg-edge.is-active { filter: drop-shadow(0 0 4px currentColor); }
.lg-node { cursor: pointer; transition: opacity 160ms ease; }
.lg-node-match { opacity: 0.24; animation: lg-breathe 2.6s ease-in-out infinite; pointer-events: none; }
.lg-node-halo { pointer-events: none; }
.lg-node-dot { stroke: var(--lg-node-stroke); stroke-width: 0.8px; transition: r 120ms ease; }
.lg-node.is-selected .lg-node-dot { stroke: var(--lg-node-stroke-selected); stroke-width: 1.6px; }
.lg-node.is-processing .lg-node-dot { animation: lg-breathe 2s ease-in-out infinite; }
.lg-node-pulse { fill: none; transform-box: fill-box; transform-origin: center; animation: lg-pulse 2.2s ease-out infinite; }
.lg-node-label {
  pointer-events: none; fill: var(--lg-node-label); font-size: var(--lg-graph-label-size); opacity: 0.94;
  paint-order: stroke; stroke: var(--lg-node-label-halo); stroke-width: 3px; stroke-linejoin: round;
}
@keyframes lg-twinkle { 0%, 100% { opacity: 0.82; } 50% { opacity: 0.32; } }
@keyframes lg-pulse { 0% { transform: scale(1); opacity: 0.85; } 80% { transform: scale(2.3); opacity: 0; } 100% { transform: scale(2.3); opacity: 0; } }
@keyframes lg-breathe { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes lg-fade-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

.lg-hud { position: absolute; z-index: 5; top: 14px; right: 16px; display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: var(--lg-radius); border: 1px solid var(--lg-border); background: var(--lg-hud-bg); }
.lg-hud-btn {
  height: 32px; min-height: 32px; padding: 0 11px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border); background: var(--lg-btn-bg); color: var(--lg-muted);
  font-size: calc(12.5px * var(--lg-fs-scale)); cursor: pointer; white-space: nowrap;
}
.lg-hud-btn:hover { color: var(--lg-text); border-color: var(--lg-border-strong); background: var(--lg-btn-bg-hover); }
.lg-legend {
  position: absolute; z-index: 4; left: 16px; bottom: 16px; max-width: 260px;
  display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 9px 11px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border);
  background: var(--lg-legend-bg);
}
.lg-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); white-space: nowrap; }
.lg-legend-item i { width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }
.lg-tooltip {
  position: absolute; z-index: 30; max-width: 320px; pointer-events: none;
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-tooltip-bg); box-shadow: 0 16px 38px var(--lg-shadow);
}
.lg-tooltip-title { font-size: calc(13.5px * var(--lg-fs-scale)); font-weight: 650; line-height: 1.4; color: var(--lg-text); }
.lg-tooltip-meta { display: flex; flex-wrap: wrap; gap: 7px; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lg-tooltip-tags { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); }
.lg-graph-empty {
  position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 28px;
}
.lg-graph-empty-title { font-size: calc(18px * var(--lg-fs-scale)); font-weight: 650; letter-spacing: 0.5px; }
.lg-graph-empty-hint { max-width: 440px; font-size: calc(13px * var(--lg-fs-scale)); line-height: 1.8; color: var(--lg-muted); }
.lg-graph-loading { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-size: calc(13px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lg-spinner { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--lg-cyan-soft); border-top-color: var(--lg-cyan); animation: lg-spin 0.9s linear infinite; }
@keyframes lg-spin { to { transform: rotate(360deg); } }
.lg-graph-error { position: absolute; z-index: 20; top: 58px; left: 50%; transform: translateX(-50%); padding: 9px 13px; border-radius: var(--lg-radius); border: 1px solid var(--lg-danger-border); background: var(--lg-error-bg); color: var(--lg-danger); font-size: calc(13px * var(--lg-fs-scale)); max-width: 90%; }
.lg-graph-retry { position: absolute; z-index: 21; top: 104px; left: 50%; transform: translateX(-50%); }
.lg-search-empty {
  position: absolute; z-index: 18; left: 50%; bottom: 18px; transform: translateX(-50%);
  padding: 7px 13px; border-radius: 999px; font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-warn);
  border: 1px solid var(--lg-warn-border); background: var(--lg-warn-bg);
  white-space: nowrap; max-width: calc(100% - 28px); overflow: hidden; text-overflow: ellipsis;
}

/* ---------- drop overlay ---------- */
.lg-drop-overlay {
  position: absolute; inset: 10px; z-index: 45; display: flex; align-items: center; justify-content: center;
  border-radius: var(--lg-radius-lg);
  border: 1.5px dashed var(--lg-cyan-border);
  background: var(--lg-drop-bg);
  pointer-events: none;
  animation: lg-fade-in 120ms ease-out;
}
.lg-drop-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 32px;
  border-radius: var(--lg-radius-lg); border: 1px solid var(--lg-cyan-border);
  background: var(--lg-drop-card-bg); box-shadow: 0 24px 60px var(--lg-shadow-strong);
}
.lg-drop-title { font-size: calc(16px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-cyan); letter-spacing: 0.5px; }
.lg-drop-hint { font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-muted); }
.lg-file-input { display: none; }
.lg-footer-hint {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 6px 16px; flex: 0 0 auto;
  border-top: 1px solid var(--lg-border);
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim);
  background: var(--lg-panel);
}

/* ---------- jobs + toasts ---------- */
.lg-toast-stack { position: absolute; z-index: 50; right: 16px; bottom: 46px; display: flex; flex-direction: column; gap: 8px; width: min(380px, calc(100% - 32px)); pointer-events: none; }
.lg-toast {
  display: flex; align-items: flex-start; gap: 9px; padding: 11px 13px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-toast-bg); box-shadow: 0 16px 40px var(--lg-shadow);
  font-size: calc(13px * var(--lg-fs-scale)); pointer-events: auto; animation: lg-toast-in 160ms ease-out;
}
@keyframes lg-toast-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
.lg-toast[data-kind='success'] { border-color: var(--lg-success-border); }
.lg-toast[data-kind='error'] { border-color: var(--lg-danger-border); }
.lg-toast-icon { flex: 0 0 auto; margin-top: 1px; color: var(--lg-cyan); }
.lg-toast[data-kind='success'] .lg-toast-icon { color: var(--lg-success); }
.lg-toast[data-kind='error'] .lg-toast-icon { color: var(--lg-danger); }
.lg-toast-text { flex: 1 1 auto; min-width: 0; color: var(--lg-text); line-height: 1.55; overflow-wrap: anywhere; }
.lg-toast-close { flex: 0 0 auto; border: 0; background: transparent; color: var(--lg-dim); cursor: pointer; padding: 0 2px; display: inline-flex; }
.lg-toast-close:hover { color: var(--lg-text); }
.lg-job {
  display: flex; flex-direction: column; gap: 6px; padding: 11px 13px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-toast-bg); box-shadow: 0 16px 40px var(--lg-shadow);
  pointer-events: auto; animation: lg-fade-in 140ms ease-out;
}
.lg-job-head { display: flex; align-items: center; gap: 8px; font-size: calc(13px * var(--lg-fs-scale)); }
.lg-job-title { flex: 1 1 auto; color: var(--lg-text); }
.lg-job-value { flex: 0 0 auto; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-cyan); }
.lg-job-message { font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-job-track { height: 5px; border-radius: 4px; background: var(--lg-clear-bg); overflow: hidden; }
.lg-job-bar { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--lg-cyan), var(--lg-accent)); transition: width 300ms ease; }
.lg-job[data-state='done'] .lg-job-title { color: var(--lg-success); }
.lg-job[data-state='done'] .lg-job-bar { background: linear-gradient(90deg, var(--lg-success), var(--lg-cyan)); }
.lg-job[data-state='failed'] { border-color: var(--lg-danger-border); }
.lg-job[data-state='failed'] .lg-job-title { color: var(--lg-danger); }

/* ---------- library ---------- */
.lg-library { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.lg-library-head { display: flex; align-items: center; gap: 8px; padding: 12px 13px 10px; border-bottom: 1px solid var(--lg-border); flex: 0 0 auto; }
.lg-library-title { font-size: calc(14px * var(--lg-fs-scale)); font-weight: 650; letter-spacing: 0.4px; }
.lg-library-sub { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim); margin-top: 1px; }
.lg-library-head .lg-btn { margin-left: auto; flex: 0 0 auto; }
.lg-library-toolbar { display: flex; align-items: center; gap: 6px; padding: 9px 13px 0; flex: 0 0 auto; }
.lg-select-wrap { flex: 1 1 auto; min-width: 0; display: flex; }
.lg-select {
  width: 100%; height: 32px; min-height: 32px; padding: 0 9px;
  border-radius: var(--lg-radius-sm); border: 1px solid var(--lg-input-border);
  background: var(--lg-input-bg); color: var(--lg-text); outline: none; cursor: pointer;
}
.lg-select:hover { border-color: var(--lg-border-strong); }
.lg-select:focus { border-color: var(--lg-cyan); box-shadow: 0 0 0 3px var(--lg-cyan-soft); }
.lg-order-btn { width: 32px; height: 32px; min-width: 32px; padding: 0; }
.lg-filter-row { display: flex; flex-wrap: wrap; gap: 5px; padding: 9px 13px; flex: 0 0 auto; }
.lg-filter-row.lg-scroll-x {
  flex-wrap: nowrap; cursor: grab; overscroll-behavior-x: contain;
  scrollbar-width: thin; scrollbar-color: var(--lg-border-strong) transparent;
}
.lg-filter-row.lg-scroll-x::-webkit-scrollbar { height: 6px; }
.lg-filter-row.lg-scroll-x::-webkit-scrollbar-track { background: transparent; }
.lg-filter-row.lg-scroll-x::-webkit-scrollbar-thumb { background: var(--lg-border); border-radius: 999px; }
.lg-filter-row.lg-scroll-x::-webkit-scrollbar-thumb:hover { background: var(--lg-border-strong); }
.lg-filter-chip {
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg); color: var(--lg-muted);
  border-radius: 999px; padding: 3px 9px; font-size: calc(11.5px * var(--lg-fs-scale)); cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; flex: 0 0 auto;
}
.lg-filter-chip:hover { color: var(--lg-text); border-color: var(--lg-border-strong); }
.lg-filter-chip.is-active { color: var(--lg-text); border-color: var(--lg-cyan); background: var(--lg-cyan-soft); }
.lg-filter-chip i { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 5px currentColor; }
.lg-paper-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 9px 9px; display: flex; flex-direction: column; gap: 3px; }
.lg-select-bar {
  display: flex; align-items: center; gap: 8px; padding: 0 13px 8px; flex: 0 0 auto;
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted);
}
.lg-check { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; white-space: nowrap; }
.lg-check input { width: 13px; height: 13px; margin: 0; accent-color: var(--lg-accent); cursor: pointer; }
.lg-select-all-btn {
  border: none; background: none; padding: 0; font: inherit; color: var(--lg-cyan);
  cursor: pointer; white-space: nowrap; text-decoration: underline dotted; text-underline-offset: 2px;
}
.lg-select-all-btn:disabled { opacity: 0.5; cursor: default; }
.lg-select-gap { flex: 1 1 auto; }
.lg-select-count { color: var(--lg-text); font-weight: 600; white-space: nowrap; }
.lg-select-hint { opacity: 0.6; white-space: nowrap; }
.lg-row-check { width: 13px; height: 13px; margin: 3px 0 0; flex: 0 0 auto; accent-color: var(--lg-accent); cursor: pointer; }
.lg-paper-row {
  display: flex; align-items: flex-start; gap: 7px; width: 100%;
  padding: 9px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid transparent; background: transparent; color: var(--lg-text);
  text-align: left; cursor: pointer;
  transition: background 110ms ease, border-color 110ms ease;
}
.lg-paper-row:hover { background: var(--lg-hover); }
.lg-paper-row.is-selected { background: var(--lg-selected-bg); border-color: var(--lg-selected-border); }
.lg-paper-dot { flex: 0 0 auto; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: var(--lg-dim); }
.lg-paper-dot.is-processing { animation: lg-breathe 1.4s ease-in-out infinite; }
.lg-paper-dot[data-status='failed'] { background: var(--lg-danger); box-shadow: 0 0 6px var(--lg-danger); }
.lg-paper-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.lg-paper-title { font-size: calc(15px * var(--lg-fs-scale)); line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.lg-paper-meta { display: flex; align-items: center; gap: 6px; font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; overflow: hidden; }
.lg-paper-meta > span { overflow: hidden; text-overflow: ellipsis; }
.lg-paper-cat { color: var(--lg-muted); }
.lg-paper-status.is-failed { color: var(--lg-danger); }
.lg-paper-status.is-processing { color: var(--lg-warn); }
.lg-library-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 34px 18px; text-align: center; color: var(--lg-dim); font-size: calc(13px * var(--lg-fs-scale)); }
.lg-library-empty-hint { font-size: calc(12px * var(--lg-fs-scale)); line-height: 1.7; max-width: 250px; }
.lg-pagination { display: flex; align-items: center; gap: 3px; justify-content: center; flex-wrap: wrap; padding: 9px; border-top: 1px solid var(--lg-border); flex: 0 0 auto; }
.lg-page-btn {
  min-width: 28px; height: 28px; padding: 0 6px; border-radius: 6px;
  border: 1px solid transparent; background: transparent; color: var(--lg-muted);
  font-size: calc(12.5px * var(--lg-fs-scale)); cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.lg-page-btn:hover { background: var(--lg-hover); color: var(--lg-text); }
.lg-page-btn.is-active { border-color: var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-text); }
.lg-page-btn[disabled] { opacity: 0.35; cursor: not-allowed; }
.lg-page-info { margin: 0 4px; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }

/* sidebar entry glyph */
.lg-panel-icon { color: inherit; display: inline-flex; align-items: center; justify-content: center; }
.lg-panel-icon.is-active { color: var(--lg-accent, #ffd166); }

/* ---------- compact main-column layouts (shell may dock both sidebars) ---------- */
@container (max-width: 1080px) {
  .lg-col-detail { display: none; }
  .lg-col-detail.is-open {
    display: flex; position: absolute; left: 0; top: 0; bottom: 0;
    width: min(340px, 88%); box-shadow: 24px 0 60px var(--lg-shadow-strong);
  }
  .lg-mobile-toggle { display: inline-flex; }
}
@container (max-width: 900px) {
  .lg-col-library { display: none; }
  .lg-col-library.is-open {
    display: flex; position: absolute; right: 0; top: 0; bottom: 0;
    width: min(360px, 92%); box-shadow: -24px 0 60px var(--lg-shadow-strong);
  }
  .lg-header-meta .lg-badge, .lg-meta-text { display: none; }
  .lg-theme-text { display: none; }
  .lg-theme-btn { width: 32px; min-width: 32px; padding: 0; }
}
@container (max-width: 680px) {
  .lg-brand-sub { display: none; }
  .lg-legend { display: none; }
  .lg-footer-hint { display: none; }
  .lg-font-btn { display: none; }
}
`;
		let styleElement$2 = null;
		/** Inject the plugin stylesheet once; returns a disposer that removes it. */
		function ensureStyles() {
			if (typeof document === "undefined" || !document.head) return () => {};
			if (typeof document.getElementById === "function" && document.getElementById("dsh-litgraph-styles")) return () => {};
			const element = document.createElement("style");
			element.id = STYLE_ID;
			element.setAttribute("data-plugin", "dsh-litgraph");
			element.textContent = CSS;
			document.head.appendChild(element);
			styleElement$2 = element;
			return () => {
				if (styleElement$2 === element && element.parentNode) element.parentNode.removeChild(element);
				if (styleElement$2 === element) styleElement$2 = null;
			};
		}
		// src/client/components/StarMap.tsx
		/**
		* The star map: an SVG viewport over the force layout.
		*
		* Interaction model
		*   - wheel            zoom about the cursor (native non-passive listener so preventDefault works)
		*   - pointer drag     pan (pointer capture on the svg)
		*   - click node       select (detail panel), click empty space keeps the selection
		*   - hover node       tooltip with title / year / categories
		*   - search matches   matching nodes stay lit, everything else dims
		*   - focus token      (from search or the library) re-centers the viewport on a node
		*/
		const MIN_SCALE = .08;
		const MAX_SCALE = 4;
		const INITIAL_VIEW = {
			scale: 1,
			x: 0,
			y: 0
		};
		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value));
		}
		function buildColorMap(clusters) {
			const map = /* @__PURE__ */ new Map();
			clusters.forEach((cluster, index) => map.set(cluster.id, clusterColor(cluster, index)));
			return map;
		}
		function textWidth(text, fontSize) {
			let width = 0;
			for (let index = 0; index < text.length; index += 1) width += text.charCodeAt(index) > 255 ? fontSize : fontSize * .56;
			return width;
		}
		function overlaps(a, b) {
			return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
		}
		const DEFAULT_LABEL_FONT_SIZE = 12.5;
		const DEFAULT_CLUSTER_FONT_SIZE = 13;
		const LABEL_TEXT = 22;
		/** Ink used by the light palette (its --lg-text), the mixing target for cluster hues. */
		const LIGHT_INK = [
			27,
			37,
			55
		];
		function hexToRgb(color) {
			const text = color.trim();
			if (text.charAt(0) !== "#") return null;
			let hex = text.slice(1);
			if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split("").map((channel) => channel + channel).join("");
			if (hex.length !== 6 && hex.length !== 8) return null;
			const numeric = Number.parseInt(hex.slice(0, 6), 16);
			if (!Number.isFinite(numeric)) return null;
			return [
				numeric >> 16 & 255,
				numeric >> 8 & 255,
				numeric & 255
			];
		}
		function mixRgb(from, to, amount) {
			const mix = (index) => Math.round(from[index] + (to[index] - from[index]) * amount);
			return "rgb(" + mix(0) + ", " + mix(1) + ", " + mix(2) + ")";
		}
		/**
		* Cluster hues come from the host and are tuned for the dark canvas. On the paper
		* palette they are mixed toward ink so dots, edges and captions keep contrast; the
		* dark palette leaves the host colours untouched.
		*/
		function themeTone(color, theme, amount) {
			if (theme !== "light") return color;
			const rgb = hexToRgb(color);
			return rgb ? mixRgb(rgb, LIGHT_INK, amount) : color;
		}
		/**
		* Greedy label placement: a label first tries the outward side of its constellation,
		* then the opposite side, then vertical lanes, skipping spots that would overlap an
		* already placed label, a cluster caption or another node's dot. Dense constellations
		* therefore stay legible without zooming in.
		*/
		function placeNodeLabels(nodes, options) {
			const viewport = options.viewport ?? {
				scale: 1,
				x: 0,
				y: 0
			};
			const view = options.size ?? {
				width: 1200,
				height: WORLD_HEIGHT
			};
			const labelFontSize = options.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE;
			options.clusterFontSize;
			const placements = /* @__PURE__ */ new Map();
			const reserved = [];
			if (options.extraReserved) reserved.push(...options.extraReserved);
			for (const node of nodes) reserved.push({
				x1: node.x - node.radius - 2,
				y1: node.y - node.radius - 2,
				x2: node.x + node.radius + 2,
				y2: node.y + node.radius + 2
			});
			const degreeMin = options.degreeMin ?? 6;
			const limit = options.limit ?? 400;
			const candidates = nodes.filter((node) => options.showAll || node.degree >= degreeMin || node.id === options.selectedId || node.id === options.hoveredId).slice().sort((a, b) => {
				if (a.id === options.selectedId) return -1;
				if (b.id === options.selectedId) return 1;
				if (a.id === options.hoveredId) return -1;
				if (b.id === options.hoveredId) return 1;
				return b.degree - a.degree || a.id.localeCompare(b.id);
			});
			const centerByCluster = new Map(options.centers.map((center) => [center.cluster.id, center]));
			const forceIds = options.forceIds ?? null;
			let placed = 0;
			for (const node of candidates) {
				if (placed >= limit) break;
				const forced = node.id === options.selectedId || node.id === options.hoveredId || forceIds !== null && forceIds.has(node.id);
				const center = centerByCluster.get(node.clusterId);
				const screenX = node.x * viewport.scale + viewport.x;
				const nearRightEdge = screenX > view.width * .72;
				const nearLeftEdge = screenX < view.width * .28;
				const outward = nearRightEdge ? false : nearLeftEdge ? true : center ? node.x >= center.x : node.x < WORLD_WIDTH * .68;
				const width = textWidth(truncate$1(node.title, LABEL_TEXT), labelFontSize) + 14;
				const laneScale = labelFontSize / DEFAULT_LABEL_FONT_SIZE;
				const lanes = [
					3.4,
					-8.2,
					15,
					-19.5,
					26.5
				].map((lane) => lane * laneScale);
				const sides = outward ? ["start", "end"] : ["end", "start"];
				let best = null;
				for (const side of sides) {
					for (const lane of lanes) {
						const x = side === "start" ? node.x + node.radius + 5 : node.x - node.radius - 5;
						const y = node.y + lane;
						const rect = side === "start" ? {
							x1: x,
							y1: y - labelFontSize * .9,
							x2: x + width,
							y2: y + labelFontSize * .34
						} : {
							x1: x - width,
							y1: y - labelFontSize * .9,
							x2: x,
							y2: y + labelFontSize * .34
						};
						const screenX1 = rect.x1 * viewport.scale + viewport.x;
						const screenX2 = rect.x2 * viewport.scale + viewport.x;
						const screenY1 = rect.y1 * viewport.scale + viewport.y;
						const screenY2 = rect.y2 * viewport.scale + viewport.y;
						let overlapArea = (Math.max(0, 8 - screenX1) + Math.max(0, screenX2 - (view.width - 8)) + Math.max(0, 8 - screenY1) + Math.max(0, screenY2 - (view.height - 8))) * 60;
						for (const taken of reserved) {
							if (!overlaps(rect, taken)) continue;
							const w = Math.min(rect.x2, taken.x2) - Math.max(rect.x1, taken.x1);
							const h = Math.min(rect.y2, taken.y2) - Math.max(rect.y1, taken.y1);
							overlapArea += Math.max(0, w) * Math.max(0, h);
						}
						if (overlapArea === 0) {
							best = {
								placement: {
									x,
									y,
									anchor: side
								},
								rect,
								overlapArea: 0
							};
							break;
						}
						if (!best || overlapArea < best.overlapArea) best = {
							placement: {
								x,
								y,
								anchor: side
							},
							rect,
							overlapArea
						};
					}
					if (best && best.overlapArea === 0) break;
				}
				if (!best) continue;
				if (best.overlapArea > 0 && !forced) continue;
				reserved.push(best.rect);
				placements.set(node.id, best.placement);
				placed += 1;
			}
			return placements;
		}
		/**
		* Greedy screen-space placement for the domain (galaxy) captions. Large libraries pack
		* several galaxies side by side, where captions wider than the gap would otherwise collide;
		* each caption tries above/below the nebula with a few horizontal nudges and is dropped only
		* when nothing fits (the legend still names every domain).
		*/
		function placeGalaxyCaptions(galaxies, options) {
			const viewport = options.viewport ?? {
				scale: 1,
				x: 0,
				y: 0
			};
			const view = options.size ?? {
				width: 1200,
				height: WORLD_HEIGHT
			};
			const font = Math.max(13, options.fontSize ?? 16);
			const lineHeight = font * 1.15;
			const reserved = [];
			const placements = /* @__PURE__ */ new Map();
			const fits = (rect) => {
				if (rect.x1 < 4 || rect.x2 > view.width - 4 || rect.y1 < 4 || rect.y2 > view.height - 4) return false;
				for (const other of reserved) if (overlaps(rect, other)) return false;
				return true;
			};
			const ordered = galaxies.slice().sort((a, b) => b.count - a.count);
			for (const galaxy of ordered) {
				const width = textWidth(galaxy.label + " · " + galaxy.count, font) + 10;
				const cx = galaxy.x * viewport.scale + viewport.x;
				const cy = galaxy.y * viewport.scale + viewport.y;
				const radius = Math.max(16, galaxy.radius) * viewport.scale;
				const nudges = [
					0,
					width / 2 + 8,
					-(width / 2 + 8),
					width + 16,
					-(width + 16)
				];
				const candidates = [];
				for (const dx of nudges) {
					const x = cx + dx;
					const bottom = cy - radius - 6;
					candidates.push({
						x,
						y: bottom,
						position: "above",
						rect: {
							x1: x - width / 2,
							y1: bottom - lineHeight,
							x2: x + width / 2,
							y2: bottom
						}
					});
					const top = cy + radius + 8;
					candidates.push({
						x,
						y: top,
						position: "below",
						rect: {
							x1: x - width / 2,
							y1: top,
							x2: x + width / 2,
							y2: top + lineHeight
						}
					});
				}
				const choice = candidates.find((candidate) => fits(candidate.rect));
				if (!choice) continue;
				reserved.push(choice.rect);
				placements.set(galaxy.group, {
					x: choice.x,
					y: choice.y,
					position: choice.position,
					rect: choice.rect
				});
			}
			return placements;
		}
		function placeClusterCaptions(centers, galaxies, options) {
			const viewport = options.viewport ?? {
				scale: 1,
				x: 0,
				y: 0
			};
			const view = options.size ?? {
				width: 1200,
				height: WORLD_HEIGHT
			};
			const clusterFont = Math.max(10, (options.clusterFontSize ?? DEFAULT_CLUSTER_FONT_SIZE) - 1);
			const galaxyFont = Math.max(13, (options.galaxyFontSize ?? DEFAULT_CLUSTER_FONT_SIZE) + 3);
			const reserved = [];
			const placements = /* @__PURE__ */ new Map();
			const fits = (rect) => {
				if (rect.x1 < 4 || rect.x2 > view.width - 4 || rect.y1 < 4 || rect.y2 > view.height - 4) return false;
				for (const other of reserved) if (overlaps(rect, other)) return false;
				return true;
			};
			if (options.reserved) reserved.push(...options.reserved);
			else for (const galaxy of galaxies) {
				const width = textWidth(galaxy.label + " · " + galaxy.count, galaxyFont) + 10;
				const bottom = (galaxy.y - galaxy.radius) * viewport.scale + viewport.y - 6;
				reserved.push({
					x1: galaxy.x * viewport.scale + viewport.x - width / 2,
					y1: bottom - galaxyFont * 1.15,
					x2: galaxy.x * viewport.scale + viewport.x + width / 2,
					y2: bottom
				});
			}
			const ordered = centers.slice().sort((a, b) => b.count - a.count);
			for (const center of ordered) {
				const radius = Math.max(12, center.radius) * viewport.scale;
				const cx = center.x * viewport.scale + viewport.x;
				const cy = center.y * viewport.scale + viewport.y;
				const width = textWidth(center.cluster.label + " · " + center.count, clusterFont) + 8;
				const height = clusterFont + 3;
				const halfWidth = width / 2 + 5;
				const halfHeight = height / 2 + 3;
				const choice = [
					{
						x: cx,
						y: cy - radius - 6 - halfHeight,
						rect: {
							x1: cx - halfWidth,
							y1: cy - radius - 6 - halfHeight * 2,
							x2: cx + halfWidth,
							y2: cy - radius - 6
						}
					},
					{
						x: cx,
						y: cy + radius + 6 + halfHeight,
						rect: {
							x1: cx - halfWidth,
							y1: cy + radius + 6,
							x2: cx + halfWidth,
							y2: cy + radius + 6 + halfHeight * 2
						}
					},
					{
						x: cx + radius + 8 + halfWidth,
						y: cy,
						rect: {
							x1: cx + radius + 8,
							y1: cy - halfHeight,
							x2: cx + radius + 8 + halfWidth * 2,
							y2: cy + halfHeight
						}
					},
					{
						x: cx - radius - 8 - halfWidth,
						y: cy,
						rect: {
							x1: cx - radius - 8 - halfWidth * 2,
							y1: cy - halfHeight,
							x2: cx - radius - 8,
							y2: cy + halfHeight
						}
					}
				].find((candidate) => fits(candidate.rect));
				if (!choice) continue;
				reserved.push(choice.rect);
				placements.set(center.cluster.id, {
					x: choice.x,
					y: choice.y,
					anchor: "middle",
					rect: choice.rect
				});
			}
			return placements;
		}
		function StarMap(props) {
			const { layout, clusters, stars, selectedId, matches, focus, loading, error, onSelect, onFit, onRelayout, children } = props;
			const theme = props.theme ?? "dark";
			const labelFontSize = props.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE;
			const clusterLabelSize = props.clusterLabelSize ?? DEFAULT_CLUSTER_FONT_SIZE;
			const containerRef = react.useRef(null);
			const svgRef = react.useRef(null);
			const [viewport, setViewport] = react.useState(INITIAL_VIEW);
			const [size, setSize] = react.useState({
				width: 0,
				height: 0
			});
			const [hoveredId, setHoveredId] = react.useState(null);
			const [tooltip, setTooltip] = react.useState(null);
			const [dragging, setDragging] = react.useState(false);
			const dragState = react.useRef(null);
			const colorMap = react.useMemo(() => buildColorMap(clusters), [clusters]);
			react.useEffect(() => {
				const element = containerRef.current;
				if (!element) return;
				const measure = () => {
					const rect = element.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) setSize({
						width: rect.width,
						height: rect.height
					});
				};
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(measure);
				observer.observe(element);
				return () => observer.disconnect();
			}, []);
			react.useEffect(() => {
				const element = containerRef.current;
				if (!element) return;
				const onWheel = (event) => {
					event.preventDefault();
					const rect = element.getBoundingClientRect();
					const px = event.clientX - rect.left;
					const py = event.clientY - rect.top;
					setViewport((current) => {
						const factor = Math.exp(-event.deltaY * .0016);
						const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
						const ratio = scale / current.scale;
						return {
							scale,
							x: px - (px - current.x) * ratio,
							y: py - (py - current.y) * ratio
						};
					});
				};
				element.addEventListener("wheel", onWheel, { passive: false });
				return () => element.removeEventListener("wheel", onWheel);
			}, []);
			const fittedRef = react.useRef("");
			react.useEffect(() => {
				if (size.width === 0 || size.height === 0 || layout.nodes.length === 0) return;
				const key = size.width + "x" + size.height + ":" + layout.seed + ":" + layout.nodes.length + ":" + layout.clusterCenters.length + ":" + labelFontSize + ":" + clusterLabelSize;
				if (fittedRef.current === key) return;
				fittedRef.current = key;
				fitToView(void 0, true);
			}, [
				size.width,
				size.height,
				layout,
				labelFontSize,
				clusterLabelSize
			]);
			function fitToView(currentScale, force = false) {
				if (layout.nodes.length === 0 || size.width === 0 || size.height === 0) return;
				let minX = Infinity;
				let minY = Infinity;
				let maxX = -Infinity;
				let maxY = -Infinity;
				for (const node of layout.nodes) {
					minX = Math.min(minX, node.x - node.radius);
					maxX = Math.max(maxX, node.x + node.radius);
					minY = Math.min(minY, node.y - node.radius);
					maxY = Math.max(maxY, node.y + node.radius);
				}
				const scale = clamp(Math.min((size.width - 220) / Math.max(1, maxX - minX), (size.height - 220) / Math.max(1, maxY - minY)), MIN_SCALE, 1.6);
				const x = size.width / 2 - (minX + maxX) / 2 * scale;
				const y = size.height / 2 - (minY + maxY) / 2 * scale;
				setViewport({
					scale: force ? scale : currentScale ?? scale,
					x,
					y
				});
			}
			react.useEffect(() => {
				if (!focus) return;
				const node = layout.byId.get(focus.id);
				if (!node || size.width === 0 || size.height === 0) return;
				setViewport((current) => {
					const scale = Math.max(current.scale, 1.15);
					return {
						scale,
						x: size.width / 2 - node.x * scale,
						y: size.height / 2 - node.y * scale
					};
				});
			}, [
				focus ? focus.token : 0,
				layout,
				size.width,
				size.height
			]);
			const onPointerDown = (event) => {
				if (event.button !== 0) return;
				const target = event.target;
				if (target && target.closest && target.closest("[data-node-hit=\"true\"]")) return;
				dragState.current = {
					startX: event.clientX,
					startY: event.clientY,
					originX: viewport.x,
					originY: viewport.y,
					moved: false
				};
				setDragging(true);
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {}
			};
			const onPointerMove = (event) => {
				const drag = dragState.current;
				if (!drag) return;
				const dx = event.clientX - drag.startX;
				const dy = event.clientY - drag.startY;
				if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
				setViewport((current) => ({
					...current,
					x: drag.originX + dx,
					y: drag.originY + dy
				}));
			};
			const endDrag = (event) => {
				const drag = dragState.current;
				dragState.current = null;
				setDragging(false);
				try {
					event.currentTarget.releasePointerCapture(event.pointerId);
				} catch {}
				if (drag && !drag.moved) onSelect(null);
			};
			const showTooltip = react.useCallback((node, event) => {
				const element = containerRef.current;
				if (!element) return;
				const rect = element.getBoundingClientRect();
				setHoveredId(node.id);
				setTooltip({
					x: event.clientX - rect.left,
					y: event.clientY - rect.top
				});
			}, []);
			const clearHover = react.useCallback(() => {
				setHoveredId(null);
				setTooltip(null);
			}, []);
			const handleNodeClick = react.useCallback((node, event) => {
				event.stopPropagation();
				onSelect(node.id);
			}, [onSelect]);
			const searchActive = matches !== null;
			const dense = layout.nodes.length > 260;
			const selectedEdges = react.useMemo(() => {
				if (!selectedId) return /* @__PURE__ */ new Set();
				const set = /* @__PURE__ */ new Set();
				for (const edge of layout.edges) if (edge.source === selectedId || edge.target === selectedId) set.add(edge.id);
				return set;
			}, [layout.edges, selectedId]);
			const hoveredNode = hoveredId ? layout.byId.get(hoveredId) : void 0;
			const showLabels = viewport.scale > (dense ? .92 : .72);
			const [labelViewport, setLabelViewport] = react.useState(viewport);
			react.useEffect(() => {
				const timer = setTimeout(() => setLabelViewport(viewport), 140);
				return () => clearTimeout(timer);
			}, [viewport]);
			const galaxyCaptions = react.useMemo(() => placeGalaxyCaptions(layout.galaxies, {
				viewport,
				size,
				fontSize: Math.max(13, clusterLabelSize + 3)
			}), [
				layout.galaxies,
				viewport,
				size,
				clusterLabelSize
			]);
			const clusterCaptions = react.useMemo(() => placeClusterCaptions(layout.clusterCenters, layout.galaxies, {
				viewport,
				size,
				clusterFontSize: clusterLabelSize,
				reserved: [...galaxyCaptions.values()].map((placement) => placement.rect)
			}), [
				layout.clusterCenters,
				layout.galaxies,
				galaxyCaptions,
				viewport,
				size,
				clusterLabelSize
			]);
			const captionObstacles = react.useMemo(() => {
				const obstacles = [];
				const push = (rect) => {
					obstacles.push({
						x1: (rect.x1 - viewport.x) / viewport.scale,
						y1: (rect.y1 - viewport.y) / viewport.scale,
						x2: (rect.x2 - viewport.x) / viewport.scale,
						y2: (rect.y2 - viewport.y) / viewport.scale
					});
				};
				for (const placement of clusterCaptions.values()) if (placement.rect) push(placement.rect);
				for (const placement of galaxyCaptions.values()) push(placement.rect);
				return obstacles;
			}, [
				clusterCaptions,
				galaxyCaptions,
				viewport
			]);
			const labelPlacements = react.useMemo(() => placeNodeLabels(matches === null ? layout.nodes : layout.nodes.filter((node) => matches.has(node.id)), {
				centers: layout.clusterCenters,
				selectedId,
				hoveredId,
				showAll: showLabels,
				degreeMin: dense ? searchActive ? -1 : 8 : 6,
				limit: dense ? 80 : 400,
				viewport: labelViewport,
				size,
				labelFontSize,
				clusterFontSize: clusterLabelSize,
				forceIds: matches,
				extraReserved: captionObstacles
			}), [
				layout.nodes,
				layout.clusterCenters,
				matches,
				selectedId,
				hoveredId,
				showLabels,
				dense,
				searchActive,
				labelViewport,
				size,
				labelFontSize,
				clusterLabelSize,
				captionObstacles
			]);
			const starsEl = react.useMemo(() => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
				className: "lg-stars",
				"aria-hidden": true,
				children: stars.map((star, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					className: "lg-star",
					cx: star.x,
					cy: star.y,
					r: star.radius,
					opacity: star.opacity,
					style: { animationDelay: star.delay + "ms" }
				}, "star-" + index))
			}), [stars]);
			const nebulaEl = react.useMemo(() => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
				className: "lg-nebulas",
				"aria-hidden": true,
				children: [layout.galaxies.map((galaxy) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					className: "lg-galaxy-nebula",
					cx: galaxy.x,
					cy: galaxy.y,
					r: Math.max(120, galaxy.radius * 1.12),
					fill: galaxy.color
				}, "galaxy-" + galaxy.group)), layout.clusterCenters.map((center) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					className: "lg-nebula",
					cx: center.x,
					cy: center.y,
					r: Math.max(44, center.radius * 1.16),
					fill: colorMap.get(center.cluster.id) ?? "#7fd1ff"
				}, "nebula-" + center.cluster.id))]
			}), [
				layout.galaxies,
				layout.clusterCenters,
				colorMap
			]);
			const edgesEl = react.useMemo(() => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
				className: "lg-edges",
				"aria-hidden": true,
				children: layout.edges.map((edge) => {
					const related = selectedId !== null && selectedEdges.has(edge.id);
					const touchesHover = hoveredId !== null && (edge.source === hoveredId || edge.target === hoveredId);
					const dim = searchActive && !(matches.has(edge.source) && matches.has(edge.target));
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						className: "lg-edge" + (related || touchesHover ? " is-active" : ""),
						d: edge.path,
						stroke: themeTone(edge.color, theme, .42),
						strokeWidth: related ? 1.7 : edge.kind === "category" ? 1.1 : .8,
						opacity: (related ? Math.min(.9, edge.opacity + .5) : touchesHover ? edge.opacity + .3 : edge.opacity) * (dim ? .25 : 1),
						fill: "none"
					}, edge.id);
				})
			}), [
				layout.edges,
				selectedEdges,
				selectedId,
				hoveredId,
				searchActive,
				matches,
				theme
			]);
			const nodesEl = react.useMemo(() => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
				className: "lg-nodes",
				children: layout.nodes.map((node) => {
					const tone = themeTone(colorMap.get(node.clusterId) ?? "#7fd1ff", theme, .48);
					const isSelected = node.id === selectedId;
					const isHovered = node.id === hoveredId;
					const matched = matches === null || matches.has(node.id);
					const isProcessing = node.status === "processing";
					const opacity = matched ? 1 : searchActive ? .16 : .5;
					const labelVisible = isSelected || isHovered || matched && (dense ? showLabels || searchActive : showLabels || node.degree >= 6);
					const placement = labelPlacements.get(node.id);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
						className: "lg-node" + (isSelected ? " is-selected" : "") + (isProcessing ? " is-processing" : ""),
						opacity,
						"data-node-hit": "true",
						"data-node-id": node.id,
						"data-node-status": node.status,
						onClick: (event) => handleNodeClick(node, event),
						onMouseEnter: (event) => showTooltip(node, event),
						onMouseMove: (event) => showTooltip(node, event),
						onMouseLeave: clearHover,
						children: [
							isProcessing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: "lg-node-pulse",
								cx: node.x,
								cy: node.y,
								r: node.radius + 6,
								fill: "none",
								stroke: tone
							}) : null,
							searchActive && matched && !isSelected && !isHovered ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: "lg-node-match",
								cx: node.x,
								cy: node.y,
								r: node.radius + 7.5,
								fill: tone
							}) : null,
							isSelected || isHovered ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: "lg-node-halo",
								cx: node.x,
								cy: node.y,
								r: node.radius + 9,
								fill: tone,
								opacity: .16
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: "lg-node-dot" + (isSelected ? " is-selected" : ""),
								cx: node.x,
								cy: node.y,
								r: isSelected || isHovered ? node.radius + 2.2 : node.radius,
								fill: tone
							}),
							labelVisible && placement ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
								className: "lg-node-label",
								x: placement.x,
								y: placement.y,
								textAnchor: placement.anchor,
								style: { fontSize: labelFontSize },
								children: truncate$1(node.title, LABEL_TEXT)
							}) : null
						]
					}, node.id);
				})
			}), [
				layout.nodes,
				colorMap,
				theme,
				selectedId,
				hoveredId,
				searchActive,
				matches,
				labelPlacements,
				labelFontSize,
				showLabels,
				dense,
				handleNodeClick,
				showTooltip,
				clearHover
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lg-graph" + (dragging ? " lg-graph-dragging" : ""),
				ref: containerRef,
				"data-graph-scale": viewport.scale.toFixed(2),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						ref: svgRef,
						className: "lg-graph-svg",
						width: "100%",
						height: "100%",
						role: "img",
						"aria-label": "文献知识图谱",
						onPointerDown,
						onPointerMove,
						onPointerUp: endDrag,
						onPointerCancel: endDrag,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("radialGradient", {
								id: "lg-nebula-fade",
								cx: "50%",
								cy: "50%",
								r: "50%",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("stop", {
									offset: "0%",
									stopColor: "#ffffff",
									stopOpacity: "0.055"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("stop", {
									offset: "100%",
									stopColor: "#ffffff",
									stopOpacity: "0"
								})]
							}) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
								className: "lg-graph-bg",
								x: "0",
								y: "0",
								width: "100%",
								height: "100%",
								fill: "transparent"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
								transform: "translate(" + viewport.x + " " + viewport.y + ") scale(" + viewport.scale + ")",
								children: [
									starsEl,
									nebulaEl,
									edgesEl,
									nodesEl
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-cluster-captions",
						"aria-hidden": true,
						children: [layout.galaxies.map((galaxy) => {
							const placement = galaxyCaptions.get(galaxy.group);
							if (!placement) return null;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lg-galaxy-caption",
								style: {
									left: placement.x,
									top: placement.y,
									color: themeTone(galaxy.color, theme, .46),
									fontSize: Math.max(13, clusterLabelSize + 3),
									transform: placement.position === "above" ? "translate(-50%,-100%)" : "translate(-50%,0)"
								},
								children: [
									galaxy.label,
									" · ",
									galaxy.count
								]
							}, "galaxy-caption-" + galaxy.group);
						}), layout.clusterCenters.map((center) => {
							if (layout.clusterCenters.length > 24 && viewport.scale < .22) return null;
							const placement = clusterCaptions.get(center.cluster.id);
							if (!placement) return null;
							const color = colorMap.get(center.cluster.id) ?? "#7fd1ff";
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lg-cluster-caption",
								style: {
									left: placement.x,
									top: placement.y,
									color: themeTone(color, theme, .55),
									fontSize: Math.max(10, clusterLabelSize - 1),
									transform: "translate(-50%,-50%)"
								},
								children: [
									center.cluster.label,
									" · ",
									center.count
								]
							}, "cluster-caption-" + center.cluster.id);
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-hud",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-icon-btn",
								title: "放大",
								"aria-label": "放大",
								onClick: () => setViewport((v) => ({
									...v,
									scale: clamp(v.scale * 1.25, MIN_SCALE, MAX_SCALE)
								})),
								children: "+"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-icon-btn",
								title: "缩小",
								"aria-label": "缩小",
								onClick: () => setViewport((v) => ({
									...v,
									scale: clamp(v.scale / 1.25, MIN_SCALE, MAX_SCALE)
								})),
								children: "−"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-icon-btn",
								title: "适配视图",
								"aria-label": "适配视图",
								onClick: onFit,
								children: "⤢"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-hud-btn",
								title: "重新布局",
								onClick: onRelayout,
								children: "重新布局"
							})
						]
					}),
					layout.galaxies.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-legend",
						"aria-label": "研究领域图例",
						children: layout.galaxies.map((galaxy) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "lg-legend-item",
							title: galaxy.group + " · " + galaxy.count + " 篇",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: themeTone(galaxy.color, theme, .4) } }), galaxy.label]
						}, galaxy.group))
					}) : null,
					hoveredNode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-tooltip",
						style: {
							left: (tooltip ? tooltip.x : 0) + 14,
							top: (tooltip ? tooltip.y : 0) + 12
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-tooltip-title",
								children: hoveredNode.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lg-tooltip-meta",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: themeTone(colorMap.get(hoveredNode.clusterId) ?? "#7fd1ff", theme, .55) },
										children: hoveredNode.clusterLabel
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: hoveredNode.year ?? "年份未知" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [hoveredNode.degree, " 条关联"] })
								]
							}),
							hoveredNode.categories.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-tooltip-tags",
								children: hoveredNode.categories.join(" · ")
							}) : null,
							hoveredNode.status === "processing" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-tooltip-tags",
								children: "AI 理解中…"
							}) : null
						]
					}) : null,
					layout.nodes.length === 0 && !loading && !error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-graph-empty",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lg-graph-empty-title",
							children: "这片星空还是空的"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lg-graph-empty-hint",
							children: "把 PDF 拖进面板，或点击下方「导入文献」开始。"
						})]
					}) : null,
					loading && layout.nodes.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-graph-loading",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-spinner" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "正在计算星图…" })]
					}) : null,
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-graph-error",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: ["图谱加载失败：", error] })
					}) : null,
					children
				]
			});
		}
		function truncate$1(value, max) {
			if (!value) return "";
			return value.length > max ? value.slice(0, max - 1) + "…" : value;
		}
		// src/client/components/icons.tsx
		/** Small dependency-free icon set drawn on a 24x24 grid. */
		function svgProps(size, className, style) {
			return {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": true,
				className,
				style
			};
		}
		function SearchIcon({ size = 14, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11",
					cy: "11",
					r: "6.2",
					stroke: "currentColor",
					strokeWidth: "1.7"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M15.6 15.6 20 20",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round"
				})]
			});
		}
		function CloseIcon({ size = 12, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...svgProps(size, className, style),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M6 6l12 12M18 6L6 18",
					stroke: "currentColor",
					strokeWidth: "1.8",
					strokeLinecap: "round"
				})
			});
		}
		/** The LitGraph mark: a tiny constellation. */
		function ConstellationIcon({ size = 18, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4.5 16.5 9 8.2l5.2 3.1 5.3-5.1M9 8.2l1.6 8.3 4.4-2 3.8 4.4",
						stroke: "currentColor",
						strokeWidth: "1.15",
						strokeLinecap: "round",
						strokeLinejoin: "round",
						opacity: "0.75"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "4.5",
						cy: "16.5",
						r: "1.55",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "9",
						cy: "8.2",
						r: "1.9",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "14.2",
						cy: "11.3",
						r: "1.35",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "19.5",
						cy: "6.2",
						r: "1.75",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "10.6",
						cy: "16.5",
						r: "1.2",
						fill: "currentColor",
						opacity: "0.8"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "18.8",
						cy: "18.9",
						r: "1.45",
						fill: "currentColor",
						opacity: "0.9"
					})
				]
			});
		}
		function LayoutIcon({ size = 14, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "3.2",
						y: "4.2",
						width: "17.6",
						height: "15.6",
						rx: "2.4",
						stroke: "currentColor",
						strokeWidth: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "9",
						cy: "10",
						r: "1.5",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "15",
						cy: "9",
						r: "1.1",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "13",
						cy: "15",
						r: "1.3",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M9 10l6-1M9 10l4 5M15 9l-2 6",
						stroke: "currentColor",
						strokeWidth: "1",
						opacity: "0.65"
					})
				]
			});
		}
		function ResetIcon({ size = 14, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.8 9.2A7.3 7.3 0 0 1 18.6 12a7.2 7.2 0 1 1-2.6-5.6",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.6 4.6v4.9h4.9",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})]
			});
		}
		function ExternalIcon({ size = 13, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M13.5 5.2h5.3v5.3M18.4 5.5l-7.2 7.2",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M17.6 14.2v3.6a1.8 1.8 0 0 1-1.8 1.8H6.4a1.8 1.8 0 0 1-1.8-1.8V8.4a1.8 1.8 0 0 1 1.8-1.8h3.5",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round"
				})]
			});
		}
		function TrashIcon({ size = 13, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.8 7h14.4M9.4 4.6h5.2M6.6 7l.8 12.1a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.4 7",
					stroke: "currentColor",
					strokeWidth: "1.6",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10.2 11v5.6M13.8 11v5.6",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					opacity: "0.8"
				})]
			});
		}
		function LocateIcon({ size = 13, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "6.4",
						stroke: "currentColor",
						strokeWidth: "1.6"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "2",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3",
						stroke: "currentColor",
						strokeWidth: "1.6",
						strokeLinecap: "round"
					})
				]
			});
		}
		function ChevronIcon({ size = 12, direction = "left", className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...svgProps(size, className, style),
				style: {
					...style || {},
					transform: direction === "right" ? "rotate(180deg)" : void 0
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M14.4 5.8 8.2 12l6.2 6.2",
					stroke: "currentColor",
					strokeWidth: "1.9",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		function SortIcon({ size = 12, order = "desc", className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M12 4.6v14.8",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round",
					opacity: "0.5"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: order === "desc" ? "M7.6 10.4 12 5.6l4.4 4.8M7.6 14.2l4.4 4.8 4.4-4.8" : "M7.6 9.6 12 14.4l4.4-4.8M7.6 5.8 12 1l4.4 4.8",
					stroke: "currentColor",
					strokeWidth: "1.7",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					opacity: order === "desc" ? 1 : .45
				})]
			});
		}
		function InfoIcon({ size = 13, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "8.4",
						stroke: "currentColor",
						strokeWidth: "1.6"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M12 11v5.6",
						stroke: "currentColor",
						strokeWidth: "1.7",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "7.8",
						r: "1.05",
						fill: "currentColor"
					})
				]
			});
		}
		function CheckIcon({ size = 13, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				...svgProps(size, className, style),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.8 12.4 9.6 17 19 6.8",
					stroke: "currentColor",
					strokeWidth: "1.9",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		function AlertIcon({ size = 13, className, style }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				...svgProps(size, className, style),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M12 4.6 21 19.4H3L12 4.6Z",
						stroke: "currentColor",
						strokeWidth: "1.6",
						strokeLinejoin: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M12 10.2v4.1",
						stroke: "currentColor",
						strokeWidth: "1.7",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "17",
						r: "1",
						fill: "currentColor"
					})
				]
			});
		}
		// src/client/components/SearchBar.tsx
		/** Top search bar: live highlighting, keyboard submit, suggestion dropdown. */
		function SearchBar(props) {
			const { value, onChange, onSubmit, onPick, suggestions, matchCount, total, inputRef } = props;
			const [focused, setFocused] = react.useState(false);
			const [active, setActive] = react.useState(0);
			const localRef = react.useRef(null);
			const ref = inputRef ?? localRef;
			const query = value.trim();
			const open = focused && query.length > 0 && suggestions.length > 0;
			react.useEffect(() => {
				setActive(0);
			}, [query]);
			const onKeyDown = (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					if (open && suggestions[active]) onPick(suggestions[active].id);
					else onSubmit(value);
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					onChange("");
					return;
				}
				if (!open) return;
				if (event.key === "ArrowDown") {
					event.preventDefault();
					setActive((current) => (current + 1) % suggestions.length);
				} else if (event.key === "ArrowUp") {
					event.preventDefault();
					setActive((current) => (current - 1 + suggestions.length) % suggestions.length);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lg-search" + (open ? " is-open" : ""),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "lg-search-icon",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchIcon, { size: 15 })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: (element) => {
							ref.current = element;
						},
						className: "lg-search-input",
						type: "search",
						value,
						placeholder: "搜索标题、作者、关键词、方法…",
						"aria-label": "搜索文献",
						spellCheck: false,
						onChange: (event) => onChange(event.target.value),
						onKeyDown,
						onFocus: () => setFocused(true),
						onBlur: () => {
							window.setTimeout(() => setFocused(false), 120);
						}
					}),
					query.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "lg-search-clear",
						"aria-label": "清空搜索",
						onClick: () => {
							onChange("");
							ref.current && ref.current.focus();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 11 })
					}) : null,
					query.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "lg-search-count",
						children: [
							matchCount,
							"/",
							total,
							" 命中"
						]
					}) : null,
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-suggest",
						role: "listbox",
						children: suggestions.map((node, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "option",
							"aria-selected": index === active,
							className: "lg-suggest-row" + (index === active ? " is-active" : ""),
							onMouseEnter: () => setActive(index),
							onMouseDown: (event) => {
								event.preventDefault();
								onPick(node.id);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-suggest-title",
								children: node.title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lg-suggest-meta",
								children: [node.clusterLabel, node.year ? " · " + node.year : ""]
							})]
						}, node.id))
					}) : null
				]
			});
		}
		// src/client/styles-features.ts
		/**
		* LitGraph feature add-ons: notes / tags / star, library filters + export menu,
		* the settings dialog, and the timeline view.
		*
		* Kept in its own stylesheet (injected once by ensureFeatureStyles) so the main
		* styles.ts stays owned by the theme work. Everything reads the shared --lg-*
		* design tokens, so it follows the dark and light palettes automatically.
		*/
		const FEATURE_STYLE_ID = "dsh-litgraph-feature-styles";
		const FEATURE_CSS = String.raw`
/* ================= library header extras: export / settings ================= */
.lgf-head-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex: 0 0 auto; }
.lgf-head-actions .lg-btn { margin-left: 0; }
.lgf-tool-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; min-width: 32px; padding: 0;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-btn-bg); color: var(--lg-muted);
  font-size: calc(16px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.lgf-tool-btn:hover { background: var(--lg-btn-bg-hover); color: var(--lg-text); border-color: var(--lg-border-strong); }
.lgf-tool-btn[aria-expanded='true'] { border-color: var(--lg-cyan); color: var(--lg-cyan); background: var(--lg-cyan-soft); }
.lgf-tool-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
.lgf-tool-btn:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }

/* inline success/error banner (fallback for hosts that do not pass onToast) */
.lgf-notice {
  display: flex; align-items: center; gap: 6px; margin: 0 13px 8px; padding: 7px 10px;
  border-radius: var(--lg-radius-sm); border: 1px solid var(--lg-border);
  background: var(--lg-chip-bg); color: var(--lg-muted);
  font-size: calc(12px * var(--lg-fs-scale)); line-height: 1.5;
}
.lgf-notice[data-kind='success'] { border-color: var(--lg-success-border); background: var(--lg-success-soft); color: var(--lg-success); }
.lgf-notice[data-kind='error'] { border-color: var(--lg-danger-border); background: var(--lg-danger-soft); color: var(--lg-danger); }
.lgf-notice[data-kind='info'] { border-color: var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-cyan); }

/* dropdown menu shared by export + (future) bulk actions */
.lgf-menu-wrap { position: relative; display: inline-flex; }
.lgf-menu {
  position: absolute; z-index: 60; top: calc(100% + 6px); right: 0; min-width: 212px;
  display: flex; flex-direction: column; gap: 2px; padding: 5px;
  border-radius: var(--lg-radius); border: 1px solid var(--lg-border-strong);
  background: var(--lg-panel-solid); box-shadow: 0 18px 44px var(--lg-shadow-strong);
  animation: lg-fade-in 120ms ease-out;
}
.lgf-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 9px;
  border: 0; border-radius: var(--lg-radius-sm); background: transparent;
  color: var(--lg-text); font-family: var(--lg-font); font-size: calc(12.5px * var(--lg-fs-scale));
  text-align: left; cursor: pointer; white-space: nowrap;
}
.lgf-menu-item:hover { background: var(--lg-hover); }
.lgf-menu-item:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -2px; }
.lgf-menu-item[disabled] { opacity: 0.5; cursor: not-allowed; }
.lgf-menu-item small { margin-left: auto; color: var(--lg-dim); font-size: calc(11px * var(--lg-fs-scale)); }
.lgf-menu-sep { height: 1px; margin: 3px 5px; background: var(--lg-border); }
.lgf-menu-note { padding: 5px 9px 4px; color: var(--lg-dim); font-size: calc(11px * var(--lg-fs-scale)); line-height: 1.55; }

/* ================= detail panel: star / notes / tags ================= */
.lgf-star-btn { color: var(--lg-muted); }
.lgf-star-btn.is-on { color: var(--lg-accent); border-color: var(--lg-accent-border); background: var(--lg-accent-soft); }
.lgf-section-head { display: flex; align-items: center; gap: 8px; }
.lgf-section-head h3 { flex: 1 1 auto; }
.lgf-save-state {
  display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto;
  font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap;
}
.lgf-save-state[data-state='pending'] { color: var(--lg-warn); }
.lgf-save-state[data-state='saving'] { color: var(--lg-cyan); }
.lgf-save-state[data-state='saving']::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; animation: lg-breathe 1.2s ease-in-out infinite;
}
.lgf-save-state[data-state='saved'] { color: var(--lg-success); }
.lgf-save-state[data-state='error'] { color: var(--lg-danger); }
.lgf-save-retry {
  padding: 0; border: 0; background: transparent; color: inherit;
  font: inherit; text-decoration: underline; cursor: pointer;
}
.lgf-textarea {
  width: 100%; min-height: 92px; max-height: 280px; resize: vertical; box-sizing: border-box;
  padding: 9px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-input-border); background: var(--lg-input-bg); color: var(--lg-text);
  font-family: var(--lg-font); font-size: calc(12.5px * var(--lg-fs-scale)); line-height: 1.65;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.lgf-textarea::placeholder { color: var(--lg-dim); }
.lgf-textarea:focus { border-color: var(--lg-cyan); background: var(--lg-input-bg-focus); box-shadow: 0 0 0 3px var(--lg-cyan-soft); }
.lgf-tag-editor {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px; box-sizing: border-box;
  min-height: 36px; padding: 6px 7px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-input-border); background: var(--lg-input-bg);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.lgf-tag-editor:focus-within { border-color: var(--lg-cyan); box-shadow: 0 0 0 3px var(--lg-cyan-soft); }
.lgf-tag {
  display: inline-flex; align-items: center; gap: 2px; max-width: 100%;
  padding: 1px 3px 1px 8px; border-radius: 999px;
  border: 1px solid var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-muted);
  font-size: calc(11px * var(--lg-fs-scale));
}
.lgf-tag-label {
  max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer;
}
span.lgf-tag-label { cursor: default; }
.lgf-tag-label:hover { color: var(--lg-text); }
.lgf-tag-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; color: var(--lg-dim);
  font-size: calc(13px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
}
.lgf-tag-x:hover { color: var(--lg-danger); background: var(--lg-danger-soft); }
.lgf-tag-input {
  flex: 1 1 86px; min-width: 86px; height: 22px; padding: 0 2px;
  border: 0; background: transparent; color: var(--lg-text); outline: none;
  font-family: var(--lg-font); font-size: calc(12px * var(--lg-fs-scale));
}
.lgf-tag-input::placeholder { color: var(--lg-dim); }
.lgf-tag-input[disabled] { cursor: not-allowed; }
.lgf-hint { font-size: calc(11px * var(--lg-fs-scale)); line-height: 1.55; color: var(--lg-dim); }
.lgf-hint.is-error { color: var(--lg-danger); }

/* ================= library rows: star + tag chips ================= */
.lgf-paper-row { font-family: var(--lg-font); }
.lgf-paper-row:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -1px; }
.lgf-row-star {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; margin: -2px -3px 0 0; padding: 0;
  border: 0; border-radius: 50%; background: transparent; color: var(--lg-dim);
  font-size: calc(15px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
  transition: color 120ms ease, background 120ms ease, transform 120ms ease;
}
.lgf-row-star:hover { color: var(--lg-accent); background: var(--lg-accent-soft); transform: scale(1.1); }
.lgf-row-star.is-on { color: var(--lg-accent); text-shadow: 0 0 9px var(--lg-accent-border); }
.lgf-row-star[disabled] { opacity: 0.5; cursor: not-allowed; }
.lgf-row-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 1px; }
.lgf-row-tag {
  display: inline-flex; align-items: center; max-width: 104px; height: 17px; padding: 0 6px;
  border: 1px solid var(--lg-border); border-radius: 999px;
  background: var(--lg-chip-bg); color: var(--lg-dim);
  font-family: var(--lg-font); font-size: calc(10.5px * var(--lg-fs-scale));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.lgf-row-tag:hover { color: var(--lg-cyan); border-color: var(--lg-cyan-border); }
.lgf-row-tag.is-more { border-style: dashed; cursor: default; }
.lgf-filter-label {
  display: inline-flex; align-items: center; flex: 0 0 auto; padding-right: 1px;
  font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim);
}
.lgf-star-filter.is-active { border-color: var(--lg-accent-border); color: var(--lg-accent); background: var(--lg-accent-soft); }

/* ================= settings dialog ================= */
.lgf-modal-backdrop {
  position: fixed; inset: 0; z-index: 90;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(4, 8, 18, 0.55); backdrop-filter: blur(2px);
  animation: lg-fade-in 140ms ease-out;
}
.lgf-modal {
  display: flex; flex-direction: column; width: min(460px, 100%); max-height: min(82vh, 600px);
  overflow: auto; border-radius: var(--lg-radius-lg);
  border: 1px solid var(--lg-border-strong); background: var(--lg-panel-solid);
  box-shadow: 0 28px 72px var(--lg-shadow-strong);
}
.lgf-modal-head { display: flex; align-items: center; gap: 10px; padding: 13px 15px 11px; border-bottom: 1px solid var(--lg-border); }
.lgf-modal-title { flex: 1 1 auto; font-size: calc(14px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-text); }
.lgf-modal-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--lg-dim); font-size: calc(18px * var(--lg-fs-scale));
  line-height: 1; cursor: pointer;
}
.lgf-modal-close:hover { color: var(--lg-text); background: var(--lg-hover); }
.lgf-modal-body { display: flex; flex-direction: column; gap: 12px; padding: 14px 15px; }
.lgf-modal-section-title { font-size: calc(12px * var(--lg-fs-scale)); font-weight: 600; color: var(--lg-muted); }
.lgf-radio-row {
  display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 10px 11px;
  border-radius: var(--lg-radius-sm); border: 1px solid var(--lg-border);
  background: var(--lg-panel-raised); color: inherit;
  font-family: var(--lg-font); text-align: left; cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.lgf-radio-row:hover { border-color: var(--lg-border-strong); }
.lgf-radio-row.is-active { border-color: var(--lg-cyan); background: var(--lg-cyan-soft); }
.lgf-radio-row:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }
.lgf-radio-dot {
  position: relative; flex: 0 0 auto; width: 15px; height: 15px; margin-top: 2px;
  border-radius: 50%; border: 1.5px solid var(--lg-border-strong);
}
.lgf-radio-row.is-active .lgf-radio-dot { border-color: var(--lg-cyan); }
.lgf-radio-row.is-active .lgf-radio-dot::after {
  content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--lg-cyan);
}
.lgf-radio-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lgf-radio-label { font-size: calc(13px * var(--lg-fs-scale)); color: var(--lg-text); }
.lgf-radio-hint { font-size: calc(11.5px * var(--lg-fs-scale)); line-height: 1.5; color: var(--lg-dim); }
.lgf-modal-note {
  padding: 8px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-warn-border); background: var(--lg-warn-soft);
  color: var(--lg-warn); font-size: calc(11.5px * var(--lg-fs-scale)); line-height: 1.6;
}
.lgf-modal-loading, .lgf-modal-error { font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1.6; }
.lgf-modal-error { color: var(--lg-danger); }
.lgf-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 11px 15px 13px; border-top: 1px solid var(--lg-border); }

/* ================= timeline view ================= */
.lgf-timeline {
  --lgf-lane-label: 122px;
  display: flex; flex-direction: column; gap: 10px;
  height: 100%; min-height: 0; padding: 14px 16px 16px; box-sizing: border-box;
}
.lgf-timeline-head {
  display: flex; align-items: center; gap: 10px; flex: 0 0 auto;
  min-height: 34px; padding-left: 150px; box-sizing: border-box;
}
.lgf-timeline-heading { display: flex; flex-direction: column; min-width: 0; }
.lgf-timeline-title { font-size: calc(15px * var(--lg-fs-scale)); font-weight: 650; letter-spacing: 0.4px; color: var(--lg-text); }
.lgf-timeline-sub {
  margin-top: 2px; font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lgf-timeline-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.lgf-timeline-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding-right: 2px; display: flex; flex-direction: column; }
.lgf-timeline-plot {
  position: relative; display: flex; flex-direction: column;
  flex: 1 1 auto; min-width: 100%; min-height: 320px;
}
.lgf-lanes { flex: 1 1 auto; min-height: 220px; display: flex; flex-direction: column; }
.lgf-lane { display: flex; align-items: stretch; flex: 1 1 0; min-height: 64px; }
.lgf-lane + .lgf-lane { border-top: 1px solid var(--lg-border); }
.lgf-lane-label {
  flex: 0 0 var(--lgf-lane-label); width: var(--lgf-lane-label); box-sizing: border-box;
  display: flex; align-items: center; gap: 6px; padding: 5px 10px 5px 2px;
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted);
}
.lgf-lane-label span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgf-lane-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }
.lgf-lane-count { flex: 0 0 auto; margin-left: auto; font-style: normal; font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lgf-lane-track { position: relative; flex: 1 1 auto; min-width: 220px; border-left: 1px solid var(--lg-border); }
.lgf-lane-line { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: var(--lg-border); opacity: 0.4; pointer-events: none; }
.lgf-grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--lg-border); opacity: 0.28; pointer-events: none; }
.lgf-point {
  position: absolute; width: 11px; height: 11px; margin: 0; padding: 0;
  border-radius: 50%; border: 1.5px solid var(--lg-panel-solid);
  background: var(--lg-cyan); transform: translate(-50%, -50%);
  cursor: pointer; transition: transform 120ms ease, box-shadow 120ms ease;
}
.lgf-point:hover, .lgf-point:focus-visible {
  transform: translate(-50%, -50%) scale(1.35); outline: none; z-index: 3;
  box-shadow: 0 0 0 3px var(--lg-cyan-soft), 0 0 12px currentColor;
}
.lgf-point.is-selected {
  z-index: 4; border-color: var(--lg-accent);
  box-shadow: 0 0 0 3px var(--lg-accent-soft), 0 0 14px var(--lg-accent-border);
}
.lgf-axis { display: flex; align-items: stretch; flex: 0 0 auto; height: 30px; margin-top: 4px; }
.lgf-axis-spacer { flex: 0 0 var(--lgf-lane-label); width: var(--lgf-lane-label); }
.lgf-axis-track { position: relative; flex: 1 1 auto; min-width: 220px; border-left: 1px solid var(--lg-border); border-top: 1px solid var(--lg-border); }
.lgf-axis-label { position: absolute; top: 6px; font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }
.lgf-unknown {
  flex: 0 0 auto; display: flex; flex-direction: column; gap: 7px; margin-top: 10px; padding: 10px 12px;
  border-radius: var(--lg-radius); border: 1px dashed var(--lg-border); background: var(--lg-panel-raised);
}
.lgf-unknown-title { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lgf-unknown-list { display: flex; flex-wrap: wrap; gap: 5px; }
.lgf-unknown-chip {
  max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lg-border);
  background: var(--lg-chip-bg); color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(11px * var(--lg-fs-scale)); cursor: pointer;
}
.lgf-unknown-chip:hover { color: var(--lg-text); border-color: var(--lg-cyan-border); }
.lgf-unknown-chip.is-selected { color: var(--lg-text); border-color: var(--lg-cyan); background: var(--lg-cyan-soft); }
.lgf-timeline-empty { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; }
.lgf-timeline-empty-title { font-size: calc(15px * var(--lg-fs-scale)); color: var(--lg-muted); }
.lgf-timeline-empty-hint { max-width: 330px; font-size: calc(12px * var(--lg-fs-scale)); line-height: 1.7; color: var(--lg-dim); }
.lgf-timeline-tip { transform: translate(-50%, calc(-100% - 10px)); }
@container (max-width: 900px) {
  .lgf-timeline { --lgf-lane-label: 88px; padding: 11px 12px 13px; }
  .lgf-point { width: 10px; height: 10px; }
}
@container (max-width: 720px) {
  .lgf-timeline-head { padding-left: 0; padding-top: 36px; align-items: flex-start; }
  .lgf-timeline-sub { white-space: normal; }
}

/* ================= 5-star rating + journal metrics ================= */
.lgf-rating { display: inline-flex; align-items: center; gap: 1px; margin-right: 2px; }
.lgf-rating-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0;
  border: 0; border-radius: var(--lg-radius-sm); background: transparent;
  color: var(--lg-dim); font-family: var(--lg-font);
  font-size: calc(15px * var(--lg-fs-scale)); line-height: 1; cursor: pointer;
  transition: color 120ms ease, background 120ms ease, transform 120ms ease;
}
.lgf-rating-btn:hover { color: var(--lg-accent); background: var(--lg-accent-soft); transform: translateY(-1px); }
.lgf-rating-btn.is-on { color: var(--lg-accent); text-shadow: 0 0 8px var(--lg-accent-border); }
.lgf-rating-btn:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -2px; }
.lgf-rating-btn[disabled] { opacity: 0.55; cursor: not-allowed; transform: none; }
.lgf-rating-label { margin-left: 6px; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }

.lgf-metrics-source {
  flex: 0 0 auto; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-cyan);
  font-size: calc(10.5px * var(--lg-fs-scale)); letter-spacing: 0.3px; white-space: nowrap;
}
.lgf-metrics-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 8px; margin: 0; padding: 0;
}
.lgf-metric {
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
  padding: 8px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border); background: var(--lg-panel-raised);
}
.lgf-metric dt { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lgf-metric dd {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 0;
  font-family: var(--lg-font); font-size: calc(14px * var(--lg-fs-scale));
  font-weight: 600; color: var(--lg-text); line-height: 1.35;
}
.lgf-metric-value {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
  font-family: var(--lg-font); font-size: calc(14px * var(--lg-fs-scale));
  font-weight: 600; color: var(--lg-text);
}
.lgf-metrics-top {
  padding: 0 5px; border-radius: 4px;
  border: 1px solid var(--lg-accent-border); background: var(--lg-accent-soft);
  color: var(--lg-accent-text);
  font-size: calc(9.5px * var(--lg-fs-scale)); font-weight: 700;
  letter-spacing: 0.6px; line-height: 1.6;
}
.lgf-metric-sub {
  font-size: calc(10.5px * var(--lg-fs-scale)); font-weight: 400;
  color: var(--lg-dim); line-height: 1.45;
}
.lgf-metrics .lgf-hint { margin-top: 2px; }
.lgf-metrics-query {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  margin-top: 8px; padding: 6px 12px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-border); background: var(--lg-btn-bg); color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(12px * var(--lg-fs-scale)); cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.lgf-metrics-query:hover:not([disabled]) {
  background: var(--lg-btn-bg-hover); color: var(--lg-text); border-color: var(--lg-border-strong);
}
.lgf-metrics-query[disabled] { opacity: 0.55; cursor: progress; }
.lgf-metrics-query:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }

.lgf-row-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 3px; }
.lgf-row-metrics { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
.lgf-row-metric {
  display: inline-flex; align-items: center; max-width: 132px; height: 16px; padding: 0 6px;
  border: 1px solid var(--lg-border); border-radius: 999px;
  background: var(--lg-chip-bg); color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(10px * var(--lg-fs-scale));
  line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lgf-row-metric:first-child { border-color: var(--lg-cyan-border); color: var(--lg-cyan); }
.lgf-row-rating {
  flex: 0 0 auto; display: inline-flex; align-items: center;
  color: var(--lg-accent); font-size: calc(11px * var(--lg-fs-scale));
  letter-spacing: 0.5px; white-space: nowrap;
}
.lgf-rating-filter.is-active {
  border-color: var(--lg-accent-border); color: var(--lg-accent); background: var(--lg-accent-soft);
}
.lgf-sort-hint {
  flex: 0 0 auto; font-size: calc(10.5px * var(--lg-fs-scale));
  color: var(--lg-dim); white-space: nowrap;
}
/* --- Zotero read state (detail header + library rows) -------------------- */
/* Outer rail + solid icon badge: unmistakable at a glance, still on-token. */
.lgf-paper-row { position: relative; }
.lgf-read-rail {
  position: absolute; left: 0; top: 7px; bottom: 7px; width: 4px;
  border-radius: 999px; pointer-events: none;
}
.lgf-row-read .lgf-read-rail { background: linear-gradient(180deg, #46c07a, #2f9e5f); }
.lgf-row-unread .lgf-read-rail {
  background: linear-gradient(180deg, #ffcf5c, #e0a92b);
  animation: lgf-read-glow 2.8s ease-in-out infinite;
}
@keyframes lgf-read-glow {
  0%, 100% { box-shadow: 0 0 0 rgba(224, 169, 43, 0); }
  50% { box-shadow: 0 0 10px rgba(224, 169, 43, 0.55); }
}
@media (prefers-reduced-motion: reduce) {
  .lgf-row-unread .lgf-read-rail { animation: none; }
}
/* Unread rows get a warm wash so the eye finds them while scrolling. */
.lgf-row-unread { background: rgba(230, 176, 40, 0.05); border-color: rgba(230, 176, 40, 0.14); }
.lgf-row-unread:hover { background: rgba(230, 176, 40, 0.09); }
.lgf-row-read { background: transparent; }
.lgf-paper-row.is-selected .lgf-read-rail { top: 6px; bottom: 6px; }
.lgf-read-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: calc(12px * var(--lg-fs-scale)); font-weight: 700; letter-spacing: 0.4px;
  line-height: 1; padding: 4px 11px 4px 9px; border-radius: 999px;
  border: 1px solid transparent; white-space: nowrap;
}
.lgf-read-icon {
  width: 15px; height: 15px; border-radius: 50%; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 800; color: #fff; letter-spacing: 0;
}
.lgf-read-pill.is-read {
  color: #1c7d49; background: rgba(47, 158, 95, 0.18);
  border-color: rgba(47, 158, 95, 0.55);
}
.lgf-read-pill.is-read .lgf-read-icon { background: #2f9e5f; box-shadow: 0 0 0 2px rgba(47, 158, 95, 0.2); }
.lgf-read-pill.is-unread {
  color: #8a5c00; background: rgba(230, 176, 40, 0.22);
  border-color: rgba(214, 160, 32, 0.65);
}
.lgf-read-pill.is-unread .lgf-read-icon { background: #e0a92b; color: #3a2a00; box-shadow: 0 0 0 2px rgba(224, 169, 43, 0.22); }
[data-lg-theme='dark'] .lgf-read-pill.is-read { color: #63e8a0; background: rgba(47, 158, 95, 0.24); border-color: rgba(99, 232, 160, 0.5); }
[data-lg-theme='dark'] .lgf-read-pill.is-unread { color: #ffd465; background: rgba(230, 176, 40, 0.2); border-color: rgba(255, 212, 101, 0.55); }
[data-lg-theme='dark'] .lgf-row-unread { background: rgba(230, 176, 40, 0.08); border-color: rgba(255, 212, 101, 0.16); }
[data-lg-theme='dark'] .lgf-row-unread:hover { background: rgba(230, 176, 40, 0.14); }
.lg-paper-meta > .lgf-read-pill { flex: 0 0 auto; overflow: visible; text-overflow: clip; margin-left: auto; }
.lg-paper-meta > .lg-paper-cat { flex: 1 1 auto; min-width: 0; }
/* Detail: big badge in the header + colored accent edge on the panel. */
.lg-detail.is-read { box-shadow: inset 3px 0 0 rgba(47, 158, 95, 0.75); }
.lg-detail.is-unread { box-shadow: inset 3px 0 0 rgba(224, 169, 43, 0.8); }
.lg-detail-eyebrow .lgf-read-pill { margin-left: auto; font-size: calc(13px * var(--lg-fs-scale)); padding: 5px 13px 5px 10px; gap: 7px; }
.lg-detail-eyebrow .lgf-read-icon { width: 17px; height: 17px; font-size: 10px; }

/* --- Zotero sync (detail panel) ------------------------------------------ */
.lgf-zotero-status {
  font-size: calc(10px * var(--lg-fs-scale)); color: var(--lg-dim);
  border: 1px solid var(--lg-border); border-radius: 999px; padding: 1px 8px;
}
.lgf-zotero-meta {
  display: flex; flex-wrap: wrap; gap: 4px 12px;
  font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim);
}
.lgf-zotero-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lgf-zotero-chip {
  font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-accent-text);
  background: var(--lg-accent-soft); border: 1px solid var(--lg-accent-border);
  border-radius: 999px; padding: 1px 8px; white-space: nowrap;
}
.lgf-zotero-list {
  display: flex; flex-direction: column; gap: 2px;
  max-height: 180px; overflow: auto; padding: 4px 2px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-input-bg);
}
.lgf-zotero-option {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-text);
  padding: 2px 4px; border-radius: var(--lg-radius-sm);
}
.lgf-zotero-option:hover { background: var(--lg-hover); }
.lgf-zotero-option input { accent-color: var(--lg-accent); }
.lgf-zotero-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.lgf-zotero-btn {
  font: inherit; font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-text);
  background: var(--lg-btn-bg); border: 1px solid var(--lg-border-strong);
  border-radius: var(--lg-radius-sm); padding: 4px 10px; cursor: pointer;
}
.lgf-zotero-btn:hover:not(:disabled) { background: var(--lg-btn-bg-hover); }
.lgf-zotero-btn:disabled { opacity: 0.55; cursor: default; }
.lgf-zotero-btn.is-primary {
  color: var(--lg-accent-text); border-color: var(--lg-accent-border);
  background: var(--lg-accent-soft);
}

`;
		let featureStyleElement = null;
		/** Inject the feature stylesheet once; returns a disposer that removes it. */
		function ensureFeatureStyles() {
			if (typeof document === "undefined" || !document.head) return () => {};
			if (typeof document.getElementById === "function" && document.getElementById("dsh-litgraph-feature-styles")) return () => {};
			const element = document.createElement("style");
			element.id = FEATURE_STYLE_ID;
			element.setAttribute("data-plugin", "dsh-litgraph");
			element.textContent = FEATURE_CSS;
			document.head.appendChild(element);
			featureStyleElement = element;
			return () => {
				if (featureStyleElement === element && element.parentNode) element.parentNode.removeChild(element);
				if (featureStyleElement === element) featureStyleElement = null;
			};
		}
		// src/client/components/DetailPanel.tsx
		/** Left column: everything the host knows about the selected paper (plus notes / tags / star). */
		ensureFeatureStyles();
		const NOTES_MAX = 2e4;
		const TAGS_MAX = 24;
		const TAG_LEN_MAX = 40;
		const NOTES_DEBOUNCE_MS = 800;
		const RATING_VALUES = [
			1,
			2,
			3,
			4,
			5
		];
		/** After POST /metrics/refresh, poll GET /paper until metrics appear. */
		const METRICS_POLL_INTERVAL_MS = 1200;
		const METRICS_POLL_TIMEOUT_MS = 2e4;
		function DetailPanel(props) {
			const { detail, loading, error, clusters, deleting, onOpenFile, onDelete, onLocate, onRetry, onChanged, onToast, onTagFilter } = props;
			const cluster = detail && detail.clusterId ? clusters.find((item) => item.id === detail.clusterId) : void 0;
			const clusterColor = cluster ? cluster.color : "#7fd1ff";
			const paperId = detail ? detail.id : null;
			const readAt = typeof detail?.zotero?.lastRead === "number" ? detail.zotero.lastRead : 0;
			const readState = readAt > 0;
			const [notesDraft, setNotesDraft] = react.useState("");
			const [saveState, setSaveState] = react.useState("idle");
			const [saveError, setSaveError] = react.useState(null);
			const [tags, setTags] = react.useState([]);
			const [tagDraft, setTagDraft] = react.useState("");
			const [tagHint, setTagHint] = react.useState(null);
			const [tagsSaving, setTagsSaving] = react.useState(false);
			const [rating, setRating] = react.useState(0);
			const [ratingBusy, setRatingBusy] = react.useState(false);
			const [metricsBusy, setMetricsBusy] = react.useState(false);
			const [metricsHint, setMetricsHint] = react.useState(null);
			const [metricsOverride, setMetricsOverride] = react.useState(null);
			/** Id whose metrics poll is still running; cleared on selection change/unmount. */
			const pollIdRef = react.useRef(null);
			const metrics = metricsOverride ?? (detail && detail.metrics ? detail.metrics : null);
			const [zoteroState, setZoteroState] = react.useState(null);
			const [zoteroBusy, setZoteroBusy] = react.useState(false);
			const [zoteroHint, setZoteroHint] = react.useState(null);
			const [collectionEditing, setCollectionEditing] = react.useState(false);
			const [collectionDraft, setCollectionDraft] = react.useState([]);
			const zoteroRef = detail ? detail.zotero : void 0;
			const loadZoteroState = react.useCallback(async () => {
				try {
					setZoteroState(await fetchZoteroState());
				} catch (caught) {
					setZoteroState(null);
					setZoteroHint("读取 Zotero 状态失败：" + describeError$1(caught));
				}
			}, []);
			react.useEffect(() => {
				loadZoteroState();
			}, [loadZoteroState]);
			const syncZoteroLink = react.useCallback(async () => {
				if (paperId === null) return;
				setZoteroBusy(true);
				setZoteroHint(null);
				try {
					const result = await syncZotero();
					if (!result.ok) {
						setZoteroHint(result.error ?? "同步失败：请先打开 Zotero（高级 → 杂项 → 允许其他应用通讯）");
						return;
					}
					const paper = await fetchPaper(paperId);
					onChanged?.(paper);
					await loadZoteroState();
					onToast?.("success", result.matched > 0 ? "已同步 Zotero：匹配 " + result.matched + "/" + result.total + " 篇" : "Zotero 里没有找到标题一致的条目");
				} catch (caught) {
					setZoteroHint("同步失败：" + describeError$1(caught));
				} finally {
					setZoteroBusy(false);
				}
			}, [
				paperId,
				onChanged,
				onToast,
				loadZoteroState
			]);
			const authorizeZoteroWrite = react.useCallback(async () => {
				setZoteroBusy(true);
				setZoteroHint("Zotero 会弹出授权确认，请点「Always Allow」以便长期记录阅读时间。");
				try {
					const result = await authorizeZotero();
					if (!result.ok) {
						setZoteroHint(result.error ?? "Zotero 授权失败");
						return;
					}
					await loadZoteroState();
					setZoteroHint(result.remembered === false ? "授权成功（仅本次有效，下次写入会再询问）" : null);
					onToast?.("success", "已授权 LitGraph 修改 Zotero");
				} catch (caught) {
					setZoteroHint("授权失败：" + describeError$1(caught));
				} finally {
					setZoteroBusy(false);
				}
			}, [loadZoteroState, onToast]);
			const startCollectionEdit = () => {
				setCollectionDraft([...detail?.zotero?.collections ?? []]);
				setCollectionEditing(true);
				setZoteroHint(null);
			};
			const toggleCollectionDraft = (key) => {
				setCollectionDraft((draft) => draft.includes(key) ? draft.filter((item) => item !== key) : [...draft, key]);
			};
			const saveCollections = react.useCallback(async () => {
				if (paperId === null) return;
				setZoteroBusy(true);
				setZoteroHint(null);
				try {
					const result = await setPaperCollections(paperId, collectionDraft);
					if (!result.ok) {
						setZoteroHint(result.error ?? "保存失败");
						if (result.code === "NEED_AUTH") await loadZoteroState();
						return;
					}
					if (result.paper) onChanged?.(result.paper);
					setCollectionEditing(false);
					onToast?.("success", "已更新 Zotero 分类");
				} catch (caught) {
					const raw = describeError$1(caught);
					if (raw.includes("NEED_AUTH")) {
						setZoteroHint("需要先授权：点「授权 Zotero」并在弹窗里选 Always Allow，然后再点保存。");
						await loadZoteroState();
					} else if (raw.includes("NOT_LINKED")) setZoteroHint("这篇还没链接到 Zotero 条目，先点「同步 Zotero」。");
					else setZoteroHint("保存失败：" + raw.slice(0, 240));
				} finally {
					setZoteroBusy(false);
				}
			}, [
				paperId,
				collectionDraft,
				onChanged,
				onToast,
				loadZoteroState
			]);
			const savedRef = react.useRef(null);
			const draftRef = react.useRef("");
			const prevIdRef = react.useRef(null);
			const timerRef = react.useRef(null);
			draftRef.current = notesDraft;
			react.useEffect(() => {
				savedRef.current = paperId ? {
					id: paperId,
					notes: detail?.notes ?? ""
				} : null;
				setNotesDraft(detail?.notes ?? "");
				setTags(detail?.tags ?? []);
				setRating(readRating$1(detail));
				setSaveState("idle");
				setSaveError(null);
				setTagDraft("");
				setTagHint(null);
				setTagsSaving(false);
				setRatingBusy(false);
				pollIdRef.current = null;
				setMetricsBusy(false);
				setMetricsHint(null);
				setMetricsOverride(null);
			}, [paperId]);
			react.useEffect(() => {
				return () => {
					const prevId = prevIdRef.current;
					if (!prevId) return;
					const saved = savedRef.current;
					if (saved && saved.id === prevId && saved.notes !== draftRef.current) updatePaper(prevId, { notes: draftRef.current }).catch(() => void 0);
				};
			}, [paperId]);
			react.useEffect(() => {
				prevIdRef.current = paperId;
			}, [paperId]);
			const saveNotes = react.useCallback(async (id, text) => {
				setSaveState("saving");
				setSaveError(null);
				try {
					const result = await updatePaper(id, { notes: text });
					if (savedRef.current && savedRef.current.id === id) savedRef.current.notes = text;
					setSaveState(draftRef.current === text ? "saved" : "pending");
					onChanged?.(result.paper);
				} catch (caught) {
					setSaveState("error");
					setSaveError(describeError$1(caught));
					onToast?.("error", "笔记保存失败：" + describeError$1(caught));
				}
			}, [onChanged, onToast]);
			react.useEffect(() => {
				if (!paperId) return;
				const saved = savedRef.current;
				if (!saved || saved.id !== paperId) return;
				if (notesDraft === saved.notes) {
					setSaveState((state) => state === "pending" ? "idle" : state);
					return;
				}
				setSaveState((state) => state === "saving" ? state : "pending");
				setSaveError(null);
				const timer = window.setTimeout(() => {
					timerRef.current = null;
					saveNotes(paperId, notesDraft);
				}, NOTES_DEBOUNCE_MS);
				timerRef.current = timer;
				return () => {
					window.clearTimeout(timer);
					if (timerRef.current === timer) timerRef.current = null;
				};
			}, [
				notesDraft,
				paperId,
				saveNotes
			]);
			react.useEffect(() => {
				if (saveState !== "saved") return;
				const timer = window.setTimeout(() => setSaveState((state) => state === "saved" ? "idle" : state), 2200);
				return () => window.clearTimeout(timer);
			}, [saveState]);
			const flushNotes = react.useCallback(() => {
				const id = paperId;
				const saved = savedRef.current;
				if (!id || !saved || saved.id !== id) return;
				if (notesDraft === saved.notes) return;
				if (timerRef.current !== null) {
					window.clearTimeout(timerRef.current);
					timerRef.current = null;
				}
				saveNotes(id, notesDraft);
			}, [
				paperId,
				notesDraft,
				saveNotes
			]);
			const applyPatch = react.useCallback(async (patch) => {
				if (!paperId) return null;
				return updatePaper(paperId, patch);
			}, [paperId]);
			const saveTags = react.useCallback(async (next) => {
				if (!paperId) return;
				const previous = tags;
				setTags(next);
				setTagsSaving(true);
				setTagHint(null);
				try {
					const result = await applyPatch({ tags: next });
					if (result && Array.isArray(result.paper.tags)) setTags(result.paper.tags);
					if (result) onChanged?.(result.paper);
				} catch (caught) {
					setTags(previous);
					setTagHint("标签保存失败：" + describeError$1(caught));
					onToast?.("error", "标签保存失败");
				} finally {
					setTagsSaving(false);
				}
			}, [
				paperId,
				tags,
				applyPatch,
				onChanged,
				onToast
			]);
			const addTag = react.useCallback((raw) => {
				if (!paperId || tagsSaving) return;
				const value = raw.replace(/[\s,，、;；]+/g, " ").trim();
				if (!value) {
					setTagDraft("");
					return;
				}
				if (value.length > TAG_LEN_MAX) {
					setTagHint("单个标签最多 40 个字符");
					return;
				}
				if (tags.length >= TAGS_MAX) {
					setTagHint("最多 24 个标签");
					return;
				}
				if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
					setTagHint("已存在同名标签");
					setTagDraft("");
					return;
				}
				setTagDraft("");
				setTagHint(null);
				saveTags([...tags, value]);
			}, [
				paperId,
				tagsSaving,
				tags,
				saveTags
			]);
			const removeTag = react.useCallback((target) => {
				if (tagsSaving) return;
				setTagHint(null);
				saveTags(tags.filter((tag) => tag !== target));
			}, [
				tagsSaving,
				tags,
				saveTags
			]);
			const rate = react.useCallback(async (value) => {
				if (!paperId || ratingBusy) return;
				const next = value === rating ? 0 : value;
				const previous = rating;
				setRating(next);
				setRatingBusy(true);
				try {
					const result = await applyPatch({
						rating: next,
						starred: next >= 1
					});
					if (result) {
						setRating(readRating$1(result.paper));
						onChanged?.(result.paper);
					}
					onToast?.("success", next === 0 ? "已清除评分" : "已评 " + next + " 星");
				} catch (caught) {
					setRating(previous);
					onToast?.("error", "评分更新失败：" + describeError$1(caught));
				} finally {
					setRatingBusy(false);
				}
			}, [
				paperId,
				ratingBusy,
				rating,
				applyPatch,
				onChanged,
				onToast
			]);
			const queryMetrics = react.useCallback(async () => {
				const id = paperId;
				if (!id || metricsBusy) return;
				pollIdRef.current = id;
				setMetricsBusy(true);
				setMetricsHint(null);
				try {
					const queued = await refreshMetrics([id], { force: true });
					if (pollIdRef.current !== id) return;
					if (!queued.ok) {
						setMetricsHint("宿主暂不支持期刊指标查询");
						return;
					}
					onToast?.("info", queued.queued > 0 ? "已提交期刊指标查询…" : "指标已是最新，正在刷新");
					const deadline = Date.now() + METRICS_POLL_TIMEOUT_MS;
					let found = null;
					while (Date.now() < deadline && pollIdRef.current === id) {
						await sleep(METRICS_POLL_INTERVAL_MS);
						if (pollIdRef.current !== id) return;
						try {
							const paper = await fetchPaper(id);
							if (paper.metrics) {
								found = paper.metrics;
								onChanged?.(paper);
								break;
							}
						} catch {}
					}
					if (pollIdRef.current !== id) return;
					if (found) {
						setMetricsOverride(found);
						onToast?.("success", "期刊指标已更新");
					} else {
						let reason = "";
						try {
							const paper = await fetchPaper(id);
							const match = /\|\s*metrics:\s*(.+)$/u.exec(paper.parseNote ?? "");
							if (match !== null) reason = match[1].trim();
						} catch {}
						setMetricsHint(reason === "" ? "重新查询也没拿到指标：会议论文通常没有分区数据，或期刊名与 EasyScholar 收录名不一致" : "EasyScholar 没收录这个期刊名（" + reason + "）。可以核对文献里的期刊字段。");
					}
				} catch (caught) {
					if (pollIdRef.current === id) {
						const status = caught instanceof ApiError ? caught.status : 0;
						setMetricsHint(status === 401 || status === 404 ? "当前运行的宿主是旧版本，还没有指标接口：完全退出并重开 DeepSeek Harness 后再试" : "查询指标失败：" + describeError$1(caught));
					}
				} finally {
					if (pollIdRef.current === id) {
						pollIdRef.current = null;
						setMetricsBusy(false);
					}
				}
			}, [
				paperId,
				metricsBusy,
				onChanged,
				onToast
			]);
			react.useEffect(() => {
				return () => {
					pollIdRef.current = null;
				};
			}, []);
			if (loading && !detail) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "lg-detail lg-scroll",
				"data-litgraph": "detail",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailSkeleton, {})
			});
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "lg-detail lg-scroll",
				"data-litgraph": "detail",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lg-detail-empty",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lg-detail-empty-title",
							children: "详情加载失败"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lg-detail-empty-hint",
							children: error
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "lg-btn lg-btn-ghost",
							onClick: onRetry,
							children: "重试"
						})
					]
				})
			});
			if (!detail) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "lg-detail lg-scroll",
				"data-litgraph": "detail",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lg-detail-empty",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-detail-empty-title",
						children: "还没有选中文献"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-detail-empty-hint",
						children: "在星图上点一个节点，或从右侧论文库挑一篇，这里会显示作者、摘要和 AI 理解结果。"
					})]
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lg-detail lg-scroll " + (readState ? "is-read" : "is-unread"),
				"data-litgraph": "detail",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-detail-eyebrow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-detail-dot",
								style: { background: clusterColor }
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "文献详情" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-detail-year",
								children: detail.year ?? "年份未知"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lgf-read-pill is-" + (readState ? "read" : "unread"),
								title: readState ? "Zotero 有阅读记录：" + formatUnix(readAt) : "Zotero 里还没有阅读记录",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgf-read-icon",
									"aria-hidden": "true",
									children: readState ? "✓" : "!"
								}), readState ? "已读" : "未读"]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "lg-detail-title",
						children: detail.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-detail-sub",
						children: [detail.authors.length > 0 ? detail.authors.join("、") : "作者未知", detail.venue ? " · " + detail.venue : ""]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-detail-chips",
						children: [
							detail.status === "processing" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-chip lg-chip-warn",
								children: STATUS_LABEL.processing
							}) : null,
							detail.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-chip lg-chip-danger",
								children: STATUS_LABEL.failed
							}) : null,
							cluster ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-chip lg-chip-cluster",
								style: {
									borderColor: clusterColor,
									color: clusterColor
								},
								children: detail.clusterLabel || cluster.label
							}) : null,
							typeof detail.degree === "number" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lg-chip",
								children: ["图中关联 ", detail.degree]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-detail-actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-rating",
								role: "group",
								"aria-label": "文献评分",
								children: [RATING_VALUES.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lgf-rating-btn" + (value <= rating ? " is-on" : ""),
									disabled: ratingBusy,
									"aria-label": value + " 星",
									"aria-pressed": value <= rating,
									title: value === rating ? "再次点击清除评分" : "评 " + value + " 星",
									onClick: () => void rate(value),
									children: value <= rating ? "★" : "☆"
								}, value)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgf-rating-label",
									children: rating > 0 ? rating + " 星" : "未评分"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "lg-btn lg-btn-primary",
								disabled: !detail.hasFile,
								onClick: () => onOpenFile(detail.id),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExternalIcon, { size: 12 }), " 打开原文"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "lg-btn",
								onClick: () => onLocate(detail.id),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocateIcon, { size: 12 }), " 图谱中定位"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "lg-btn lg-btn-danger",
								disabled: deleting,
								onClick: () => onDelete(detail.id, detail.title),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, { size: 12 }),
									" ",
									deleting ? "删除中…" : "删除"
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "笔记" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SaveIndicator, {
									state: saveState,
									error: saveError,
									onRetry: () => void saveNotes(detail.id, notesDraft)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: "lgf-textarea",
								value: notesDraft,
								maxLength: NOTES_MAX,
								rows: 4,
								placeholder: "写下想法、复现要点或待读问题… 输入后自动保存",
								"aria-label": "笔记",
								onChange: (event) => setNotesDraft(event.target.value),
								onBlur: flushNotes
							}),
							saveState === "error" && saveError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-hint is-error",
								children: saveError
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-hint",
								children: notesDraft.length > 0 ? notesDraft.length + " / 20000 字" : "输入后 0.8 秒自动保存"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "标签" }), tags.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "lgf-save-state",
									children: [
										tags.length,
										" / ",
										TAGS_MAX
									]
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-tag-editor",
								children: [tags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "lgf-tag",
									children: [onTagFilter ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-tag-label",
										title: "按标签筛选：" + tag,
										onClick: () => onTagFilter(tag),
										children: tag
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lgf-tag-label",
										title: tag,
										children: tag
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-tag-x",
										"aria-label": "删除标签 " + tag,
										title: "删除标签",
										disabled: tagsSaving,
										onClick: () => removeTag(tag),
										children: "×"
									})]
								}, tag)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "lgf-tag-input",
									value: tagDraft,
									maxLength: TAG_LEN_MAX,
									disabled: tagsSaving || tags.length >= TAGS_MAX,
									placeholder: tags.length === 0 ? "输入标签，回车添加" : tags.length >= TAGS_MAX ? "标签已满" : "继续添加…",
									"aria-label": "添加标签",
									onChange: (event) => {
										setTagDraft(event.target.value);
										if (tagHint) setTagHint(null);
									},
									onBlur: () => {
										if (tagDraft.trim()) addTag(tagDraft);
									},
									onKeyDown: (event) => {
										if (event.nativeEvent.isComposing) return;
										if (event.key === "Enter" || event.key === "," || event.key === "，" || event.key === "、" || event.key === ";" || event.key === "；") {
											event.preventDefault();
											addTag(tagDraft);
											return;
										}
										if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
											event.preventDefault();
											removeTag(tags[tags.length - 1]);
										}
									}
								})]
							}),
							tagHint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-hint is-error",
								children: tagHint
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-hint",
								children: "回车添加、点 × 删除；点击标签可按它筛选论文库"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section lgf-zotero",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgf-section-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "Zotero" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lgf-zotero-status",
								children: zoteroState === null ? "检测中…" : zoteroState.available ? "已连接 " + zoteroState.version : "未连接"
							})]
						}), zoteroRef === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lgf-hint",
							children: "这篇还没有匹配到 Zotero 条目。匹配后可以在这里直接改 Zotero 分类，打开原文也会经 Zotero 记录最后阅读时间。"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lgf-zotero-actions",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lgf-zotero-btn",
								disabled: zoteroBusy,
								onClick: () => void syncZoteroLink(),
								children: zoteroBusy ? "同步中…" : "同步 Zotero"
							})
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-zotero-meta",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["条目 ", zoteroRef.key] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: zoteroRef.lastRead ? "最后阅读 " + formatUnix(zoteroRef.lastRead) : "还没有阅读记录" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-zotero-chips",
								children: [(zoteroRef.collections ?? []).length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgf-hint",
									children: "未归入任何分类"
								}) : null, (zoteroRef.collections ?? []).map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgf-zotero-chip",
									children: collectionName(zoteroState, key)
								}, key))]
							}),
							collectionEditing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-zotero-list",
								children: [(zoteroState?.collections ?? []).length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "lgf-hint",
									children: "Zotero 里还没有分类（先在 Zotero 新建分类再同步）"
								}) : null, (zoteroState?.collections ?? []).map((collection) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "lgf-zotero-option",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: collectionDraft.includes(collection.key),
										onChange: () => toggleCollectionDraft(collection.key)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: collection.name })]
								}, collection.key))]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-zotero-actions",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-zotero-btn is-primary",
										disabled: zoteroBusy,
										onClick: () => void saveCollections(),
										children: zoteroBusy ? "保存中…" : "保存分类"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-zotero-btn",
										disabled: zoteroBusy,
										onClick: () => {
											setCollectionEditing(false);
											setZoteroHint(null);
										},
										children: "取消"
									}),
									zoteroState !== null && !zoteroState.authorized ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-zotero-btn",
										disabled: zoteroBusy,
										onClick: () => void authorizeZoteroWrite(),
										children: "授权 Zotero"
									}) : null
								]
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-zotero-actions",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-zotero-btn",
										disabled: zoteroBusy,
										onClick: startCollectionEdit,
										children: "编辑分类"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-zotero-btn",
										disabled: zoteroBusy,
										onClick: () => void syncZoteroLink(),
										children: zoteroBusy ? "同步中…" : "重新同步"
									}),
									zoteroState !== null && !zoteroState.authorized ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-zotero-btn",
										disabled: zoteroBusy,
										onClick: () => void authorizeZoteroWrite(),
										children: "授权 Zotero"
									}) : null
								]
							}),
							zoteroHint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-hint is-error",
								children: zoteroHint
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-hint",
								children: "分类改动会直接写回 Zotero；打开原文会经 Zotero 并记录最后阅读时间。"
							})
						] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section lgf-metrics",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgf-section-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "期刊指标" }), metrics ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lgf-metrics-source",
								children: "EasyScholar"
							}) : null]
						}), metrics ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: "lgf-metrics-grid",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgf-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "影响因子" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: "lgf-metric-value",
											children: formatMetric(metrics.impactFactor)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgf-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "5 年 IF" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
											className: "lgf-metric-value",
											children: formatMetric(metrics.impactFactor5)
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgf-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "JCR 分区" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: metrics.jcrQuartile || "—" })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgf-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "中科院分区" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
											metrics.casPartition || "—",
											metrics.casTop ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "lgf-metrics-top",
												children: "TOP"
											}) : null,
											metrics.casSmall ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "lgf-metric-sub",
												children: ["小类 ", metrics.casSmall]
											}) : null
										] })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgf-metric",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "ESI" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: metrics.esi || "—" })]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-hint",
								children: ["数据来自 EasyScholar · 查询于 ", formatTime(metrics.fetchedAt)]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lgf-metrics-query",
								disabled: metricsBusy,
								onClick: () => void queryMetrics(),
								children: metricsBusy ? "查询中…" : "重新查询指标"
							})
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lgf-hint",
							children: metricsHint ?? "还没有查询这篇文献的期刊指标（影响因子、JCR / 中科院分区、ESI）。"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "lgf-metrics-query",
							disabled: metricsBusy,
							onClick: () => void queryMetrics(),
							children: metricsBusy ? "查询中…" : "查询指标"
						})] })]
					}),
					detail.parseNote ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-detail-note",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoIcon, { size: 13 }),
							" ",
							detail.parseNote
						]
					}) : null,
					detail.abstract ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "摘要" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "lg-detail-prose",
							children: detail.abstract
						})]
					}) : null,
					detail.summary ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "AI 总结" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "lg-detail-prose",
							children: detail.summary
						})]
					}) : null,
					detail.contributions.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "主要贡献" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: "lg-detail-bullets",
							children: detail.contributions.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item }, index))
						})]
					}) : null,
					detail.method ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "方法" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "lg-detail-prose",
							children: detail.method
						})]
					}) : null,
					detail.keywords.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "关键词" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lg-detail-chips",
							children: detail.keywords.map((keyword) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-chip",
								children: keyword
							}, keyword))
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "lg-detail-section",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "来源" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
							className: "lg-meta-grid",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "文件名" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
									title: detail.fileName,
									children: detail.fileName || "—"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "文件大小" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: detail.size > 0 ? formatSize(detail.size) : "—" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "导入时间" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(detail.addedAt) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "最近更新" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatTime(detail.updatedAt) })
							]
						})]
					})
				]
			});
		}
		function SaveIndicator(props) {
			const { state, error, onRetry } = props;
			if (state === "idle") return null;
			const label = state === "pending" ? "未保存" : state === "saving" ? "保存中…" : state === "saved" ? "已保存" : "保存失败";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "lgf-save-state",
				"data-state": state,
				title: state === "error" && error ? error : label,
				children: state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [label, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "lgf-save-retry",
					onClick: onRetry,
					children: "重试"
				})] }) : label
			});
		}
		function DetailSkeleton() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lg-detail-skeleton",
				"aria-label": "加载中",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-eyebrow" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-title" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-title lg-skeleton-title-short" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-line" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-line" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-line lg-skeleton-line-short" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-block" })
				]
			});
		}
		/** 0..5 star rating, tolerating hosts that only know the legacy starred flag. */
		function readRating$1(paper) {
			if (!paper) return 0;
			const raw = typeof paper.rating === "number" ? paper.rating : paper.starred === true ? 1 : 0;
			if (!Number.isFinite(raw)) return 0;
			return Math.max(0, Math.min(5, Math.round(raw)));
		}
		/** One-decimal metric value; null / missing / non-positive renders as an em dash. */
		function formatMetric(value) {
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
			return Number.isInteger(value) ? String(value) : value.toFixed(1);
		}
		function sleep(ms) {
			return new Promise((resolve) => {
				window.setTimeout(resolve, ms);
			});
		}
		function describeError$1(caught) {
			if (caught instanceof Error && caught.message) return caught.message;
			return "网络错误，请重试";
		}
		function formatSize(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return "—";
			if (bytes < 1024) return bytes + " B";
			if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
			return (bytes / 1024 / 1024).toFixed(1) + " MB";
		}
		/** Unix seconds -> local date-time label for the Zotero last-read chip. */
		function formatUnix(seconds) {
			if (!Number.isFinite(seconds) || seconds <= 0) return "—";
			try {
				return (/* @__PURE__ */ new Date(seconds * 1e3)).toLocaleString("zh-CN", { hour12: false });
			} catch {
				return "—";
			}
		}
		/** Collection key -> display name, falling back to the key when Zotero is unavailable. */
		function collectionName(state, key) {
			if (state === null) return key;
			const found = state.collections.find((collection) => collection.key === key);
			return found === void 0 ? key : found.name;
		}
		function formatTime(value) {
			if (!value) return "—";
			try {
				const date = new Date(value);
				if (Number.isNaN(date.getTime())) return value;
				return date.toLocaleString("zh-CN", { hour12: false });
			} catch {
				return value;
			}
		}
		// src/client/bibtex.ts
		const BIBTEX_FILENAME = "litgraph-library.bib";
		const SPECIAL = {
			"\\": "\\textbackslash{}",
			"&": "\\&",
			"%": "\\%",
			"$": "\\$",
			"#": "\\#",
			"_": "\\_",
			"{": "\\{",
			"}": "\\}",
			"~": "\\textasciitilde{}",
			"^": "\\textasciicircum{}"
		};
		/** Collapse whitespace and escape the characters BibTeX/LaTeX treat specially. */
		function escapeBibtex(value) {
			return value.replace(/\s+/g, " ").trim().replace(/[\\&%$#_{}~^]/g, (char) => SPECIAL[char] ?? char);
		}
		/** "A. Author and B. Author"; missing author lists fall back to {Unknown}. */
		function formatBibtexAuthors(authors) {
			const cleaned = authors.map((author) => author.trim()).filter((author) => author !== "");
			if (cleaned.length === 0) return "Unknown";
			return cleaned.map((author) => escapeBibtex(author)).join(" and ");
		}
		/** Sanitize a paper id into a legal citation key, deduplicated with -2, -3, ... */
		function bibtexCiteKey(id, used) {
			const base = id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "paper";
			let key = base;
			let suffix = 2;
			while (used.has(key.toLowerCase())) {
				key = base + "_" + suffix;
				suffix += 1;
			}
			used.add(key.toLowerCase());
			return key;
		}
		function quoteField(value) {
			const trimmed = value.trim();
			if (trimmed === "") return "";
			return "{" + escapeBibtex(trimmed) + "}";
		}
		/** One BibTeX entry for one paper. */
		function paperToBibtex(paper, used) {
			const key = bibtexCiteKey(paper.id, used);
			const isArticle = paper.venue.trim() !== "" || paper.year !== null;
			const type = isArticle ? "article" : "misc";
			const fields = [];
			fields.push(["title", quoteField(paper.title || "Untitled")]);
			fields.push(["author", "{" + formatBibtexAuthors(paper.authors) + "}"]);
			if (paper.year !== null && Number.isFinite(paper.year)) fields.push(["year", "{" + String(paper.year) + "}"]);
			if (isArticle && paper.venue.trim() !== "") fields.push(["journal", quoteField(paper.venue)]);
			const keywords = (paper.keywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword !== "");
			if (keywords.length > 0) fields.push(["keywords", quoteField(keywords.join(", "))]);
			const abstract = (paper.abstract ?? "").trim();
			if (abstract !== "") fields.push(["abstract", quoteField(abstract)]);
			const note = (paper.fileName ?? "").trim();
			if (note !== "") fields.push(["note", quoteField("LitGraph 原文：" + note)]);
			const body = fields.filter((entry) => entry[1] !== "").map((entry) => "  " + entry[0] + " = " + entry[1]).join(",\n");
			return "@" + type + "{" + key + ",\n" + body + "\n}";
		}
		/** Render a whole .bib file (header comment + entries separated by blank lines). */
		function buildBibtex(papers, options = {}) {
			const generatedAt = options.generatedAt ?? /* @__PURE__ */ new Date();
			const stamp = Number.isNaN(generatedAt.getTime()) ? "" : generatedAt.toISOString().slice(0, 16).replace("T", " ");
			const used = /* @__PURE__ */ new Set();
			const entries = papers.map((paper) => paperToBibtex(paper, used));
			const header = [
				"% Generated by LitGraph" + (stamp === "" ? "" : " on " + stamp),
				"% " + papers.length + " entries",
				""
			].join("\n");
			return entries.length === 0 ? header : header + entries.join("\n\n") + "\n";
		}
		/** Trigger a browser download for a .bib payload. No-op outside the browser. */
		function downloadBibtexFile(content, fileName = BIBTEX_FILENAME) {
			if (typeof document === "undefined" || typeof URL === "undefined") return false;
			const blob = new Blob([content], { type: "application/x-bibtex;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = fileName;
			anchor.rel = "noopener";
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			setTimeout(() => URL.revokeObjectURL(url), 2e3);
			return true;
		}
		// src/client/components/LibraryPanel.tsx
		/** Right column: sortable, paginated, cluster-filtered library list. */
		ensureFeatureStyles();
		const CLUSTER_LEVEL_OPTIONS = [
			{
				value: 1,
				label: "一级 · 宽学科",
				hint: "按大类分星座，例如 机械工程 / 人工智能，适合总览"
			},
			{
				value: 2,
				label: "二级 · 子领域（推荐）",
				hint: "按子领域分星座，例如 机械工程 > 故障诊断，兼顾总览与区分度"
			},
			{
				value: 3,
				label: "三级 · 具体主题",
				hint: "按更细主题分星座，星座最多，适合精读与查找"
			}
		];
		const INSIGHT_SCOPE_OPTIONS = [
			{
				value: "cluster",
				label: "当前聚类",
				hint: "只分析星图里选中的那个聚类，最快也最聚焦"
			},
			{
				value: "group",
				label: "同一学科",
				hint: "把同一学科下所有聚类一起统计，方法面更宽"
			},
			{
				value: "all",
				label: "全部文献",
				hint: "整个论文库一起统计，最泛也最慢"
			}
		];
		const INSIGHT_YEAR_OPTIONS = [
			{
				value: 3,
				label: "近 3 年",
				hint: "默认，适合看当前热点"
			},
			{
				value: 5,
				label: "近 5 年",
				hint: "窗口更宽，波动更平滑"
			},
			{
				value: 10,
				label: "近 10 年",
				hint: "适合老领域或综述"
			}
		];
		function LibraryPanel(props) {
			const { clusters, activeCluster, sort, order, pageData, loading, error, selectedId, onCluster, onSort, onOrder, onPage, onSelect, onRetry, onImportClick, starredOnly, onStarredOnly, activeTag, onTag, minRating, onMinRating, query, onToast, onPaperPatched, onBatchDeleted, onClusterLevelChanged, onInsightSettingsChanged } = props;
			const items = pageData ? pageData.items : [];
			const total = pageData ? pageData.total : 0;
			const pageSize = pageData ? pageData.pageSize : 20;
			const page = pageData ? pageData.page : 1;
			const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
			const starredLocal = starredOnly === void 0;
			const tagLocal = activeTag === void 0;
			const ratingLocal = minRating === void 0;
			const [localStarred, setLocalStarred] = react.useState(false);
			const [localTag, setLocalTag] = react.useState(null);
			const [localMinRating, setLocalMinRating] = react.useState(null);
			const resolvedStarred = starredOnly === void 0 ? localStarred : starredOnly;
			const resolvedTag = activeTag === void 0 ? localTag : activeTag;
			const resolvedMinRating = minRating === void 0 ? localMinRating : minRating;
			const [localPatch, setLocalPatch] = react.useState({});
			const [starBusyId, setStarBusyId] = react.useState(null);
			const [notice, setNotice] = react.useState(null);
			const [exportOpen, setExportOpen] = react.useState(false);
			const [exporting, setExporting] = react.useState(false);
			const [exportProgress, setExportProgress] = react.useState(null);
			const [settingsOpen, setSettingsOpen] = react.useState(false);
			const [settingsMode, setSettingsMode] = react.useState(null);
			const [settingsLoading, setSettingsLoading] = react.useState(false);
			const [settingsError, setSettingsError] = react.useState(null);
			const [settingsSaving, setSettingsSaving] = react.useState(null);
			const [settingsEngine, setSettingsEngine] = react.useState(null);
			const [engineSaving, setEngineSaving] = react.useState(null);
			const [settingsCluster, setSettingsCluster] = react.useState(null);
			const [clusterSaving, setClusterSaving] = react.useState(null);
			const [settingsInsight, setSettingsInsight] = react.useState(null);
			const [insightSaving, setInsightSaving] = react.useState(null);
			const exportWrapRef = react.useRef(null);
			const [selected, setSelected] = react.useState(() => /* @__PURE__ */ new Set());
			const [selectAllBusy, setSelectAllBusy] = react.useState(false);
			const [bulkBusy, setBulkBusy] = react.useState(false);
			const filterRowRef = react.useRef(null);
			const checkAllRef = react.useRef(null);
			react.useEffect(() => {
				const el = filterRowRef.current;
				if (!el) return;
				const onWheel = (event) => {
					if (el.scrollWidth <= el.clientWidth + 1) return;
					if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
					const before = el.scrollLeft;
					el.scrollLeft = before + event.deltaY;
					if (el.scrollLeft !== before) event.preventDefault();
				};
				el.addEventListener("wheel", onWheel, { passive: false });
				return () => el.removeEventListener("wheel", onWheel);
			}, []);
			const notify = react.useCallback((kind, message) => {
				setNotice({
					kind,
					message,
					at: Date.now()
				});
				onToast?.(kind, message);
			}, [onToast]);
			react.useEffect(() => {
				if (!notice) return;
				const timer = window.setTimeout(() => {
					setNotice((current) => current === notice ? null : current);
				}, 5e3);
				return () => window.clearTimeout(timer);
			}, [notice]);
			const patchOf = react.useCallback((item) => {
				const patch = localPatch[item.id];
				return patch ? {
					...item,
					...patch
				} : item;
			}, [localPatch]);
			const visibleItems = react.useMemo(() => {
				const filterStar = starredLocal && resolvedStarred;
				const filterTag = tagLocal && resolvedTag !== null;
				const minR = typeof resolvedMinRating === "number" && resolvedMinRating >= 1 ? resolvedMinRating : 0;
				let list = items;
				if (filterStar || filterTag || minR > 0) list = items.filter((raw) => {
					const item = patchOf(raw);
					if (filterStar && item.starred !== true) return false;
					if (filterTag && resolvedTag) {
						if (!(item.tags ?? []).some((tag) => tag.toLowerCase() === resolvedTag.toLowerCase())) return false;
					}
					if (minR > 0 && readRating(item) < minR) return false;
					return true;
				});
				if (sort === "rating" && list.length > 1) list = list.slice().sort((a, b) => {
					const diff = readRating(patchOf(b)) - readRating(patchOf(a));
					if (diff !== 0) return diff;
					return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
				});
				return list;
			}, [
				items,
				starredLocal,
				tagLocal,
				resolvedStarred,
				resolvedTag,
				resolvedMinRating,
				patchOf,
				sort
			]);
			const itemIds = react.useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
			const pageAllSelected = itemIds.length > 0 && itemIds.every((id) => selected.has(id));
			const pageSomeSelected = !pageAllSelected && itemIds.some((id) => selected.has(id));
			const selectedCount = selected.size;
			react.useEffect(() => {
				const el = checkAllRef.current;
				if (el) el.indeterminate = pageSomeSelected;
			}, [pageSomeSelected]);
			const toggleOne = react.useCallback((id) => {
				setSelected((current) => {
					const next = new Set(current);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
			}, []);
			const togglePageAll = () => {
				setSelected((current) => {
					const next = new Set(current);
					if (pageAllSelected) for (const id of itemIds) next.delete(id);
					else for (const id of itemIds) next.add(id);
					return next;
				});
			};
			const selectAllFiltered = async () => {
				if (selectAllBusy) return;
				setSelectAllBusy(true);
				try {
					const all = await fetchAllPapers({
						sort,
						order,
						q: query ?? "",
						cluster: activeCluster,
						tag: resolvedTag ?? void 0,
						starred: resolvedStarred || void 0,
						minRating: typeof resolvedMinRating === "number" ? resolvedMinRating : void 0
					});
					setSelected(new Set(all.map((item) => item.id)));
				} catch (caught) {
					notify("error", "全选失败：" + describeError(caught));
				} finally {
					setSelectAllBusy(false);
				}
			};
			const clearSelection = () => setSelected(/* @__PURE__ */ new Set());
			const deleteSelected = async () => {
				if (bulkBusy || selected.size === 0) return;
				const ids = Array.from(selected);
				if (typeof window !== "undefined" && !window.confirm("确定删除选中的 " + ids.length + " 篇文献？这会同时从图谱中移除，且不可撤销。")) return;
				setBulkBusy(true);
				const deleted = [];
				const failed = [];
				const queue = ids.slice();
				const worker = async () => {
					for (;;) {
						const id = queue.shift();
						if (id === void 0) return;
						try {
							await deletePaper(id);
							deleted.push(id);
						} catch {
							failed.push(id);
						}
					}
				};
				try {
					await Promise.all(Array.from({ length: Math.min(4, ids.length) }, () => worker()));
				} finally {
					setBulkBusy(false);
				}
				setSelected(new Set(failed));
				if (deleted.length > 0) onBatchDeleted?.(deleted);
				if (failed.length > 0) notify("error", "已删除 " + deleted.length + " 篇，" + failed.length + " 篇删除失败");
				else notify("success", "已删除 " + deleted.length + " 篇文献");
			};
			const setStarredFilter = (value) => {
				if (onStarredOnly) onStarredOnly(value);
				else setLocalStarred(value);
			};
			const setTagFilter = (tag) => {
				if (onTag) onTag(tag);
				else setLocalTag(tag);
			};
			const setMinRatingFilter = (value) => {
				if (!ratingLocal && onMinRating) onMinRating(value);
				else setLocalMinRating(value);
			};
			react.useEffect(() => {
				if (!exportOpen) return;
				const onPointerDown = (event) => {
					if (exportWrapRef.current && !exportWrapRef.current.contains(event.target)) setExportOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") setExportOpen(false);
				};
				document.addEventListener("mousedown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("mousedown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [exportOpen]);
			react.useEffect(() => {
				if (!settingsOpen) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape" && settingsSaving === null && engineSaving === null && clusterSaving === null && insightSaving === null) setSettingsOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => document.removeEventListener("keydown", onKeyDown);
			}, [
				settingsOpen,
				settingsSaving,
				engineSaving,
				clusterSaving,
				insightSaving
			]);
			const openSettings = () => {
				setSettingsOpen(true);
				setSettingsMode(null);
				setSettingsEngine(null);
				setSettingsCluster(null);
				setSettingsInsight(null);
				setSettingsError(null);
				setSettingsLoading(true);
				fetchSettings().then((payload) => {
					setSettingsMode(payload.settings.taxonomyMode);
					setSettingsEngine(payload.settings.ocrEngine ?? "auto");
					const level = payload.settings.clusterLevel;
					setSettingsCluster(level === 1 || level === 3 ? level : 2);
					setSettingsInsight({
						scope: payload.settings.insightScope ?? "cluster",
						years: payload.settings.insightRecentYears ?? 3,
						saveNotes: payload.settings.insightSaveNotes !== false,
						precompute: payload.settings.insightPrecompute === true
					});
				}).catch((caught) => setSettingsError(describeError(caught))).finally(() => setSettingsLoading(false));
			};
			const chooseMode = async (mode) => {
				if (settingsSaving !== null || settingsMode === mode) return;
				const previous = settingsMode;
				setSettingsMode(mode);
				setSettingsError(null);
				setSettingsSaving(mode);
				try {
					const payload = await saveSettings({ taxonomyMode: mode });
					setSettingsMode(payload.settings.taxonomyMode);
					notify("success", "分类体系已切换为「" + labelOfTaxonomy(payload.settings.taxonomyMode) + "」");
				} catch (caught) {
					setSettingsMode(previous);
					setSettingsError("保存失败：" + describeError(caught));
				} finally {
					setSettingsSaving(null);
				}
			};
			const chooseEngine = async (engine) => {
				if (engineSaving !== null || settingsEngine === engine) return;
				const previous = settingsEngine;
				setSettingsEngine(engine);
				setSettingsError(null);
				setEngineSaving(engine);
				try {
					const payload = await saveSettings({ ocrEngine: engine });
					setSettingsEngine(payload.settings.ocrEngine ?? engine);
					notify("success", "扫描件 OCR 已切换为「" + labelOfEngine(payload.settings.ocrEngine ?? engine) + "」");
				} catch (caught) {
					setSettingsEngine(previous);
					setSettingsError("保存失败：" + describeError(caught));
				} finally {
					setEngineSaving(null);
				}
			};
			const chooseClusterLevel = async (level) => {
				if (clusterSaving !== null || settingsCluster === level) return;
				const previous = settingsCluster;
				setSettingsCluster(level);
				setSettingsError(null);
				setClusterSaving(level);
				try {
					const saved = (await saveSettings({ clusterLevel: level })).settings.clusterLevel;
					setSettingsCluster(saved === 1 || saved === 3 ? saved : 2);
					notify("success", "图谱聚类粒度已切换为「" + labelOfClusterLevel(saved === 1 || saved === 3 ? saved : 2) + "」");
					onClusterLevelChanged?.();
				} catch (caught) {
					setSettingsCluster(previous);
					setSettingsError("保存失败：" + describeError(caught));
				} finally {
					setClusterSaving(null);
				}
			};
			const patchInsightSettings = async (patch, key, message) => {
				if (insightSaving !== null || settingsInsight === null) return;
				const previous = settingsInsight;
				setSettingsError(null);
				setInsightSaving(key);
				setSettingsInsight({
					scope: patch.insightScope ?? previous.scope,
					years: patch.insightRecentYears ?? previous.years,
					saveNotes: patch.insightSaveNotes ?? previous.saveNotes,
					precompute: patch.insightPrecompute ?? previous.precompute
				});
				try {
					const payload = await saveSettings(patch);
					onInsightSettingsChanged?.();
					setSettingsInsight({
						scope: payload.settings.insightScope ?? previous.scope,
						years: payload.settings.insightRecentYears ?? previous.years,
						saveNotes: payload.settings.insightSaveNotes !== false,
						precompute: payload.settings.insightPrecompute === true
					});
					notify("success", message);
				} catch (caught) {
					setSettingsInsight(previous);
					setSettingsError("保存失败：" + describeError(caught));
				} finally {
					setInsightSaving(null);
				}
			};
			const toggleRowStar = async (item) => {
				if (starBusyId !== null) return;
				const effective = patchOf(item);
				const currentRating = readRating(effective);
				const next = effective.starred !== true;
				const nextRating = next ? Math.max(1, currentRating) : 0;
				setLocalPatch((current) => ({
					...current,
					[item.id]: {
						...current[item.id],
						starred: next,
						rating: nextRating
					}
				}));
				setStarBusyId(item.id);
				try {
					const result = await updatePaper(item.id, {
						starred: next,
						rating: nextRating
					});
					setLocalPatch((current) => ({
						...current,
						[item.id]: {
							starred: result.paper.starred === true,
							rating: readRating(result.paper),
							tags: result.paper.tags
						}
					}));
					onPaperPatched?.(result.paper);
					notify("success", next ? "已加入星标" : "已取消星标");
				} catch (caught) {
					setLocalPatch((current) => {
						const copy = { ...current };
						const entry = { ...copy[item.id] };
						delete entry.starred;
						delete entry.rating;
						if (Object.keys(entry).length === 0) delete copy[item.id];
						else copy[item.id] = entry;
						return copy;
					});
					notify("error", "星标更新失败：" + describeError(caught));
				} finally {
					setStarBusyId(null);
				}
			};
			const runExport = async (mode) => {
				setExportOpen(false);
				if (exporting) return;
				setExporting(true);
				setExportProgress("准备导出…");
				try {
					const papers = await fetchAllPapers(mode === "filtered" ? {
						cluster: activeCluster || void 0,
						tag: resolvedTag ?? void 0,
						starred: resolvedStarred ? true : void 0,
						minRating: typeof resolvedMinRating === "number" ? resolvedMinRating : void 0,
						q: query && query.trim() ? query.trim() : void 0
					} : {}, (fetched, all) => {
						setExportProgress("读取文献列表 " + fetched + "/" + all);
					});
					if (papers.length === 0) {
						notify("info", "当前筛选下没有可导出的文献");
						return;
					}
					setExportProgress("加载详情 0/" + papers.length);
					const details = await fetchPaperDetails(papers.map((paper) => paper.id), {
						concurrency: 6,
						onProgress: (done, all) => setExportProgress("加载详情 " + done + "/" + all)
					});
					const detailById = new Map(details.map((detail) => [detail.id, detail]));
					const entries = papers.map((paper) => {
						const detail = detailById.get(paper.id);
						return {
							id: paper.id,
							title: paper.title,
							authors: paper.authors,
							year: paper.year,
							venue: paper.venue,
							abstract: detail ? detail.abstract : "",
							keywords: detail ? detail.keywords : [],
							fileName: paper.fileName,
							tags: paper.tags ?? []
						};
					});
					if (!downloadBibtexFile(buildBibtex(entries))) {
						notify("error", "当前环境不支持文件下载");
						return;
					}
					notify("success", "已导出 " + entries.length + " 篇文献（litgraph-library.bib）");
				} catch (caught) {
					notify("error", "导出失败：" + describeError(caught));
				} finally {
					setExporting(false);
					setExportProgress(null);
				}
			};
			const secondaryText = loading && !pageData ? "加载中…" : total === 0 ? "还没有文献" : "共 " + total + " 篇";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lg-library",
				"data-litgraph": "library",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-library-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lg-library-title",
							children: "论文库"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lg-library-sub",
							children: [
								secondaryText,
								activeCluster ? " · 已过滤" : "",
								resolvedStarred ? " · 仅星标" : "",
								typeof resolvedMinRating === "number" && resolvedMinRating > 0 ? " · ≥" + resolvedMinRating + " 星" : "",
								resolvedTag ? " · 标签：" + resolvedTag : ""
							]
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgf-head-actions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "lgf-menu-wrap",
									ref: exportWrapRef,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-tool-btn",
										title: "导出 BibTeX",
										"aria-label": "导出 BibTeX",
										"aria-haspopup": "menu",
										"aria-expanded": exportOpen,
										disabled: exporting,
										onClick: () => setExportOpen((open) => !open),
										children: exporting ? "…" : "↓"
									}), exportOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgf-menu",
										role: "menu",
										"aria-label": "导出 BibTeX",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "lgf-menu-note",
												children: "BibTeX · 导出为 .bib 文件"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												role: "menuitem",
												className: "lgf-menu-item",
												disabled: exporting,
												onClick: () => void runExport("all"),
												children: "↓ 导出全部文献"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												role: "menuitem",
												className: "lgf-menu-item",
												disabled: exporting,
												onClick: () => void runExport("filtered"),
												children: ["↓ 导出当前筛选结果", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [total, " 篇"] })]
											})
										]
									}) : null]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lgf-tool-btn",
									title: "设置",
									"aria-label": "设置",
									onClick: openSettings,
									children: "⚙"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lg-btn lg-btn-primary lg-btn-sm",
									style: { marginLeft: 0 },
									disabled: exporting,
									onClick: onImportClick,
									children: "导入"
								})
							]
						})]
					}),
					exportProgress ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgf-notice",
						"data-kind": "info",
						role: "status",
						children: exportProgress
					}) : notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgf-notice",
						"data-kind": notice.kind,
						role: "status",
						children: notice.message
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-library-toolbar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: "lg-select-wrap",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: "lg-select",
									value: sort,
									"aria-label": "排序字段",
									onChange: (event) => onSort(event.target.value),
									children: SORT_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: option.value,
										children: option.label
									}, option.value))
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-icon-btn lg-order-btn",
								disabled: sort === "rating",
								title: sort === "rating" ? "评分固定按高→低排序" : order === "desc" ? "降序，点击切换" : "升序，点击切换",
								"aria-label": "切换排序方向",
								onClick: () => onOrder(order === "desc" ? "asc" : "desc"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SortIcon, { order: sort === "rating" ? "desc" : order })
							}),
							sort === "rating" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lgf-sort-hint",
								children: "当前页按评分排序"
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-filter-row lg-scroll-x",
						ref: filterRowRef,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-filter-chip lgf-star-filter" + (resolvedStarred ? " is-active" : ""),
								"aria-pressed": resolvedStarred,
								title: resolvedStarred ? "显示全部文献" : "只看星标文献",
								onClick: () => setStarredFilter(!resolvedStarred),
								children: "★ 仅星标"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-filter-chip lgf-rating-filter" + (resolvedMinRating === 4 ? " is-active" : ""),
								"aria-pressed": resolvedMinRating === 4,
								title: resolvedMinRating === 4 ? "显示全部评分" : "只看 4 星及以上",
								onClick: () => setMinRatingFilter(resolvedMinRating === 4 ? null : 4),
								children: "≥4 星"
							}),
							resolvedTag ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "lg-filter-chip is-active",
								title: "清除标签筛选",
								onClick: () => setTagFilter(null),
								children: [
									"标签：",
									resolvedTag,
									" ×"
								]
							}) : null,
							clusters.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgf-filter-label",
									children: "聚类"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lg-filter-chip" + (activeCluster === "" ? " is-active" : ""),
									onClick: () => onCluster(""),
									children: "全部"
								}),
								clusters.map((cluster) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "lg-filter-chip" + (activeCluster === cluster.id ? " is-active" : ""),
									style: activeCluster === cluster.id ? {
										borderColor: cluster.color,
										color: cluster.color
									} : void 0,
									onClick: () => onCluster(activeCluster === cluster.id ? "" : cluster.id),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: cluster.color } }), cluster.label]
								}, cluster.id))
							] }) : null
						]
					}),
					visibleItems.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-select-bar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "lg-check",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: checkAllRef,
									type: "checkbox",
									checked: pageAllSelected,
									"aria-label": "全选本页",
									onChange: togglePageAll
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: pageAllSelected ? "取消本页" : "全选本页" })]
							}),
							total > visibleItems.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-select-all-btn",
								disabled: selectAllBusy || bulkBusy,
								onClick: () => void selectAllFiltered(),
								children: selectAllBusy ? "选取中…" : "全部 " + total + " 篇"
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lg-select-gap" }),
							selectedCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "lg-select-count",
									children: [
										"已选 ",
										selectedCount,
										" 篇"
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lg-btn lg-btn-sm lg-btn-danger",
									disabled: bulkBusy,
									onClick: () => void deleteSelected(),
									children: bulkBusy ? "删除中…" : "删除所选"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lg-btn lg-btn-sm lg-btn-ghost",
									disabled: bulkBusy,
									onClick: clearSelection,
									children: "取消"
								})
							] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-select-hint",
								children: "勾选后可批量删除"
							})
						]
					}) : null,
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-library-empty",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "列表加载失败" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-library-empty-hint",
								children: error
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-btn lg-btn-ghost",
								onClick: onRetry,
								children: "重试"
							})
						]
					}) : null,
					!error && loading && !pageData ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ListSkeleton, {}) : null,
					!error && !loading && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-library-empty",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchIcon, { size: 22 }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: activeCluster ? "该聚类下还没有文献" : total === 0 ? resolvedStarred ? "还没有星标文献" : "论文库是空的" : "没有匹配的文献" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-library-empty-hint",
								children: activeCluster ? "换个聚类，或把 PDF 拖进面板导入。" : resolvedStarred ? "在详情里点星星给文献评分，评分 ≥1 即视为星标。" : "把 PDF 拖进面板，AI 会自动理解并把它挂到星图上。"
							})
						]
					}) : null,
					!error && !loading && items.length > 0 && visibleItems.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-library-empty",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchIcon, { size: 22 }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "当前筛选下没有文献" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-library-empty-hint",
								children: "关闭「仅星标」或清除标签筛选试试。"
							})
						]
					}) : null,
					visibleItems.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-paper-list lg-scroll",
						role: "list",
						children: visibleItems.map((raw) => {
							const item = patchOf(raw);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PaperRow, {
								item,
								selected: item.id === selectedId,
								checked: selected.has(item.id),
								starBusy: starBusyId === item.id,
								onToggleCheck: toggleOne,
								onSelect,
								onStarToggle: () => void toggleRowStar(raw),
								onTagClick: setTagFilter,
								clusterColor: colorOf(clusters, item.clusterId)
							}, item.id);
						})
					}) : null,
					total > pageSize ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-pagination",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-page-btn",
								disabled: page <= 1,
								"aria-label": "上一页",
								onClick: () => onPage(page - 1),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, {
									direction: "left",
									size: 13
								})
							}),
							pageWindow(page, pageCount).map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-page-btn" + (value === page ? " is-active" : ""),
								onClick: () => onPage(value),
								children: value
							}, value)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-page-btn",
								disabled: page >= pageCount,
								"aria-label": "下一页",
								onClick: () => onPage(page + 1),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, {
									direction: "right",
									size: 13
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lg-page-info",
								children: [
									page,
									"/",
									pageCount
								]
							})
						]
					}) : null,
					settingsOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgf-modal-backdrop",
						onMouseDown: (event) => {
							if (event.target === event.currentTarget && settingsSaving === null && engineSaving === null && insightSaving === null) setSettingsOpen(false);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgf-modal",
							role: "dialog",
							"aria-modal": "true",
							"aria-labelledby": "lgf-settings-title",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "lgf-modal-head",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "lgf-modal-title",
										id: "lgf-settings-title",
										children: "设置"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lgf-modal-close",
										"aria-label": "关闭设置",
										disabled: settingsSaving !== null || engineSaving !== null || insightSaving !== null,
										onClick: () => setSettingsOpen(false),
										children: "×"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "lgf-modal-body",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-section-title",
											children: "分类体系"
										}),
										settingsLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-loading",
											children: "正在读取设置…"
										}) : null,
										settingsError && settingsMode === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "lgf-modal-error",
											children: [settingsError, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: { marginTop: 8 },
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "lg-btn lg-btn-sm",
													onClick: openSettings,
													children: "重试"
												})
											})]
										}) : null,
										settingsMode !== null ? TAXONOMY_MODE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "radio",
											"aria-checked": settingsMode === option.value,
											className: "lgf-radio-row" + (settingsMode === option.value ? " is-active" : ""),
											disabled: settingsSaving !== null || engineSaving !== null || insightSaving !== null,
											onClick: () => void chooseMode(option.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgf-radio-dot" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "lgf-radio-text",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "lgf-radio-label",
													children: [option.label, settingsSaving === option.value ? "（保存中…）" : ""]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "lgf-radio-hint",
													children: option.hint
												})]
											})]
										}, option.value)) : null,
										settingsError && settingsMode !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-error",
											children: settingsError
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-note",
											children: "切换只影响之后导入的文献；已经入库文献的分类不会改变。"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-section-title",
											style: { marginTop: 18 },
											children: "图谱聚类粒度"
										}),
										settingsCluster !== null ? CLUSTER_LEVEL_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "radio",
											"aria-checked": settingsCluster === option.value,
											className: "lgf-radio-row" + (settingsCluster === option.value ? " is-active" : ""),
											disabled: settingsSaving !== null || engineSaving !== null || clusterSaving !== null,
											onClick: () => void chooseClusterLevel(option.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgf-radio-dot" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "lgf-radio-text",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "lgf-radio-label",
													children: [option.label, clusterSaving === option.value ? "（保存中…）" : ""]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "lgf-radio-hint",
													children: option.hint
												})]
											})]
										}, option.value)) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-note",
											children: "切换后星图会按新粒度重新聚类；论文本身的分类记录不变。"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-section-title",
											style: { marginTop: 18 },
											children: "扫描件 OCR"
										}),
										settingsEngine !== null ? OCR_ENGINE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "radio",
											"aria-checked": settingsEngine === option.value,
											className: "lgf-radio-row" + (settingsEngine === option.value ? " is-active" : ""),
											disabled: engineSaving !== null || settingsSaving !== null,
											onClick: () => void chooseEngine(option.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgf-radio-dot" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "lgf-radio-text",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "lgf-radio-label",
													children: [option.label, engineSaving === option.value ? "（保存中…）" : ""]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "lgf-radio-hint",
													children: option.hint
												})]
											})]
										}, option.value)) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-note",
											children: "没有文本层的扫描版 PDF 才走 OCR；文本层 PDF 照旧直接解析。"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-section-title",
											style: { marginTop: 18 },
											children: "洞察作用域"
										}),
										settingsInsight !== null ? INSIGHT_SCOPE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "radio",
											"aria-checked": settingsInsight.scope === option.value,
											className: "lgf-radio-row" + (settingsInsight.scope === option.value ? " is-active" : ""),
											disabled: insightSaving !== null,
											onClick: () => void patchInsightSettings({ insightScope: option.value }, "scope-" + option.value, "洞察作用域已切换为「" + option.label + "」"),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgf-radio-dot" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "lgf-radio-text",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "lgf-radio-label",
													children: [option.label, insightSaving === "scope-" + option.value ? "（保存中…）" : ""]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "lgf-radio-hint",
													children: option.hint
												})]
											})]
										}, option.value)) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-note",
											children: "洞察页默认只统计当前选中的聚类；切换后立即生效。"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-section-title",
											style: { marginTop: 18 },
											children: "洞察近期窗口"
										}),
										settingsInsight !== null ? INSIGHT_YEAR_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "radio",
											"aria-checked": settingsInsight.years === option.value,
											className: "lgf-radio-row" + (settingsInsight.years === option.value ? " is-active" : ""),
											disabled: insightSaving !== null,
											onClick: () => void patchInsightSettings({ insightRecentYears: option.value }, "years-" + option.value, "洞察近期窗口已切换为「" + option.label + "」"),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgf-radio-dot" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "lgf-radio-text",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "lgf-radio-label",
													children: [option.label, insightSaving === "years-" + option.value ? "（保存中…）" : ""]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "lgf-radio-hint",
													children: option.hint
												})]
											})]
										}, option.value)) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-note",
											children: "用来判断「近期升温」的窗口；升温按占比算，不按绝对篇数。"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-section-title",
											style: { marginTop: 18 },
											children: "洞察卡片"
										}),
										settingsInsight !== null ? [{
											key: "notes",
											label: "允许「存为笔记」",
											hint: "把空白组合、研究问题一键追加到证据论文的笔记里",
											on: settingsInsight.saveNotes,
											patch: { insightSaveNotes: !settingsInsight.saveNotes }
										}, {
											key: "precompute",
											label: "后台预生成全部聚类",
											hint: "打开洞察页时预先算好其它聚类，费模型调用，切换更快",
											on: settingsInsight.precompute,
											patch: { insightPrecompute: !settingsInsight.precompute }
										}].map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "radio",
											"aria-checked": row.on,
											className: "lgf-radio-row" + (row.on ? " is-active" : ""),
											disabled: insightSaving !== null,
											onClick: () => void patchInsightSettings(row.patch, row.key, "洞察设置已更新"),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgf-radio-dot" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "lgf-radio-text",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "lgf-radio-label",
													children: [
														row.label,
														"：",
														row.on ? "开" : "关",
														insightSaving === row.key ? "（保存中…）" : ""
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "lgf-radio-hint",
													children: row.hint
												})]
											})]
										}, row.key)) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgf-modal-note",
											children: "洞察只统计本库论文，不是学界前沿；每条结论都附证据论文。"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "lgf-modal-foot",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lg-btn",
										disabled: settingsSaving !== null || engineSaving !== null || insightSaving !== null,
										onClick: () => setSettingsOpen(false),
										children: "关闭"
									})
								})
							]
						})
					}) : null
				]
			});
		}
		function PaperRow(props) {
			const { item, selected, checked, clusterColor, starBusy, onSelect, onStarToggle, onTagClick, onToggleCheck } = props;
			const tags = item.tags ?? [];
			const shownTags = tags.slice(0, 3);
			const overflow = tags.length - shownTags.length;
			const starred = item.starred === true;
			const readState = typeof item.lastRead === "number" && item.lastRead > 0;
			const rating = readRating(item);
			const badges = metricsBadges(item);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "listitem",
				tabIndex: 0,
				className: "lg-paper-row lgf-paper-row " + (readState ? "lgf-row-read" : "lgf-row-unread") + (selected ? " is-selected" : ""),
				onClick: () => onSelect(item.id),
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onSelect(item.id);
					}
				},
				title: item.title,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "lgf-read-rail",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						className: "lg-row-check",
						checked,
						"aria-label": "选择《" + item.title + "》",
						title: checked ? "取消选择" : "选择",
						onClick: (event) => event.stopPropagation(),
						onChange: () => onToggleCheck(item.id),
						onKeyDown: (event) => {
							if (event.key === "Enter" || event.key === " ") event.stopPropagation();
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "lg-paper-dot" + (item.status === "processing" ? " is-processing" : ""),
						"data-status": item.status,
						style: item.status === "failed" ? void 0 : { background: clusterColor }
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "lg-paper-main",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-paper-title",
								children: item.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lg-paper-meta",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.year ?? "—" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lg-paper-cat",
										style: { color: clusterColor },
										children: item.categories[0] || "未分类"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lg-paper-status is-" + item.status,
										children: STATUS_LABEL[item.status]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "lgf-read-pill is-" + (readState ? "read" : "unread"),
										title: readState ? "Zotero 有阅读记录：" + formatReadAt(item.lastRead) : "Zotero 里还没有阅读记录",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lgf-read-icon",
											"aria-hidden": "true",
											children: readState ? "✓" : "!"
										}), readState ? "已读" : "未读"]
									})
								]
							}),
							tags.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lgf-row-tags",
								children: [shownTags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lgf-row-tag",
									title: "按标签筛选：" + tag,
									onClick: (event) => {
										event.stopPropagation();
										onTagClick(tag);
									},
									onKeyDown: (event) => {
										if (event.key === "Enter" || event.key === " ") event.stopPropagation();
									},
									children: tag
								}, tag)), overflow > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "lgf-row-tag is-more",
									title: tags.slice(3).join("、"),
									children: ["+", overflow]
								}) : null]
							}) : null,
							rating > 0 || badges.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lgf-row-stats",
								children: [badges.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgf-row-metrics",
									title: badges.join(" · "),
									children: badges.map((badge, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lgf-row-metric",
										children: badge
									}, badge + "#" + index))
								}) : null, rating > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgf-row-rating",
									title: "评分 " + rating + " 星",
									"aria-label": "评分 " + rating + " 星",
									children: ratingStars(rating)
								}) : null]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "lgf-row-star" + (starred ? " is-on" : ""),
						disabled: starBusy,
						"aria-pressed": starred,
						"aria-label": starred ? "取消星标" : "标记星标",
						title: starred ? "取消星标" : "标记星标",
						onClick: (event) => {
							event.stopPropagation();
							onStarToggle();
						},
						onKeyDown: (event) => {
							if (event.key === "Enter" || event.key === " ") event.stopPropagation();
						},
						children: starred ? "★" : "☆"
					})
				]
			});
		}
		function ListSkeleton() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "lg-paper-list",
				"aria-label": "加载中",
				children: [
					0,
					1,
					2,
					3,
					4,
					5
				].map((index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lg-skeleton lg-skeleton-row" }, index))
			});
		}
		/** Unix seconds -> "2026/11/26 16:53" for the read-state tooltip. */
		function formatReadAt(seconds) {
			if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "—";
			const date = /* @__PURE__ */ new Date(seconds * 1e3);
			const pad = (value) => String(value).padStart(2, "0");
			return date.getFullYear() + "/" + pad(date.getMonth() + 1) + "/" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
		}
		/** 0..5 star rating, tolerating hosts that only know the legacy starred flag. */
		function readRating(paper) {
			if (!paper) return 0;
			const raw = typeof paper.rating === "number" ? paper.rating : paper.starred === true ? 1 : 0;
			if (!Number.isFinite(raw)) return 0;
			return Math.max(0, Math.min(5, Math.round(raw)));
		}
		/** "★★★☆☆" — filled stars for the rating, hollow for the rest. */
		function ratingStars(rating) {
			const value = Math.max(0, Math.min(5, Math.round(rating)));
			return "★".repeat(value) + "☆".repeat(5 - value);
		}
		/** Inline journal badges: "IF 7.8" / "Q1" / "工程技术1区 TOP". */
		function metricsBadges(item) {
			const metrics = item.metrics;
			if (!metrics) return [];
			const badges = [];
			const impact = metrics.impactFactor;
			if (typeof impact === "number" && Number.isFinite(impact) && impact > 0) badges.push("IF " + (Number.isInteger(impact) ? String(impact) : impact.toFixed(1)));
			if (metrics.jcrQuartile) badges.push(metrics.jcrQuartile);
			if (metrics.casPartition) badges.push(metrics.casPartition + (metrics.casTop ? " TOP" : ""));
			else if (metrics.casTop) badges.push("CAS TOP");
			if (badges.length === 0 && metrics.esi) badges.push(metrics.esi);
			return badges;
		}
		function colorOf(clusters, clusterId) {
			const found = clusters.find((cluster) => cluster.id === clusterId);
			return found ? found.color : "#7fd1ff";
		}
		function labelOfTaxonomy(mode) {
			const found = TAXONOMY_MODE_OPTIONS.find((option) => option.value === mode);
			return found ? found.label : mode;
		}
		function labelOfEngine(engine) {
			const found = OCR_ENGINE_OPTIONS.find((option) => option.value === engine);
			return found ? found.label : engine;
		}
		function labelOfClusterLevel(level) {
			const found = CLUSTER_LEVEL_OPTIONS.find((option) => option.value === level);
			return found ? found.label : String(level);
		}
		function describeError(caught) {
			if (caught instanceof Error && caught.message) return caught.message;
			return "网络错误，请重试";
		}
		/** Windowed page numbers: first, last and up to five around the current page. */
		function pageWindow(page, pageCount) {
			const values = [];
			const start = Math.max(1, Math.min(page - 2, pageCount - 4));
			const end = Math.min(pageCount, Math.max(page + 2, 5));
			for (let value = start; value <= end; value += 1) values.push(value);
			return values;
		}
		// src/client/timeline.ts
		const FALLBACK_COLORS = [
			"#7fd1ff",
			"#b48cff",
			"#ffb86b",
			"#6be3a4",
			"#ff7f9e",
			"#8bd0ff",
			"#d6a2ff",
			"#f7d774"
		];
		/** Stable fallback colour for clusters the graph did not colour. */
		function fallbackColor(label) {
			let hash = 0;
			for (let index = 0; index < label.length; index += 1) hash = (hash * 31 + label.charCodeAt(index)) % 1000003;
			return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
		}
		/** Adapter: graph nodes + cluster palette -> timeline nodes. */
		function buildTimelineNodes(nodes, clusters) {
			const palette = /* @__PURE__ */ new Map();
			for (const cluster of clusters) palette.set(cluster.id, cluster.color);
			return nodes.map((node) => {
				const clusterLabel = node.clusterLabel || "未分类";
				return {
					id: node.id,
					title: node.title,
					year: typeof node.year === "number" && Number.isFinite(node.year) ? node.year : null,
					clusterLabel,
					color: palette.get(node.clusterId) ?? fallbackColor(clusterLabel)
				};
			});
		}
		/** Padded min/max year; a single-year library gets a +-1 domain, empty data a decade. */
		function computeYearDomain(nodes, currentYear) {
			const thisYear = currentYear ?? (/* @__PURE__ */ new Date()).getFullYear();
			const years = [];
			for (const node of nodes) if (node.year !== null && Number.isFinite(node.year)) years.push(node.year);
			if (years.length === 0) return {
				min: thisYear - 9,
				max: thisYear
			};
			let min = Math.min(...years);
			let max = Math.max(...years);
			if (min === max) {
				min -= 1;
				max += 1;
			} else {
				const pad = Math.max(1, Math.round((max - min) * .04));
				min -= pad;
				max += pad;
			}
			return {
				min,
				max
			};
		}
		/** "Nice" tick years: 1/2/5/10/20/25/50/100-year steps, at most maxTicks of them. */
		function computeYearTicks(domain, maxTicks = 8) {
			const rawStep = Math.max(1, domain.max - domain.min) / Math.max(1, maxTicks - 1);
			const steps = [
				1,
				2,
				5,
				10,
				20,
				25,
				50,
				100
			];
			let step = steps[steps.length - 1];
			for (const candidate of steps) if (candidate >= rawStep) {
				step = candidate;
				break;
			}
			const ticks = [];
			const start = Math.ceil(domain.min / step) * step;
			for (let year = start; year <= domain.max; year += step) ticks.push(year);
			return ticks;
		}
		/** 0-100 horizontal position of a year inside the domain. */
		function yearToPercent(year, domain) {
			const span = Math.max(1, domain.max - domain.min);
			const ratio = (year - domain.min) / span;
			return Math.min(100, Math.max(0, ratio * 100));
		}
		/** One lane per cluster label, biggest clusters first, sorted by year. */
		function buildTimelineLanes(nodes) {
			const lanes = /* @__PURE__ */ new Map();
			for (const node of nodes) {
				if (node.year === null) continue;
				const label = node.clusterLabel || "未分类";
				let lane = lanes.get(label);
				if (lane === void 0) {
					lane = {
						label,
						color: node.color || fallbackColor(label),
						items: []
					};
					lanes.set(label, lane);
				}
				lane.items.push(node);
			}
			const list = Array.from(lanes.values());
			for (const lane of list) lane.items.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title, "zh-Hans-CN"));
			list.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, "zh-Hans-CN"));
			return list;
		}
		function unknownYearNodes(nodes) {
			return nodes.filter((node) => node.year === null);
		}
		/** Human summary for the header: "共 8 篇 · 1987–2024". */
		function timelineSummary(nodes) {
			const known = nodes.filter((node) => node.year !== null);
			if (known.length === 0) return "共 " + nodes.length + " 篇 · 暂无年份数据";
			let min = known[0].year;
			let max = min;
			for (const node of known) {
				const year = node.year;
				if (year < min) min = year;
				if (year > max) max = year;
			}
			const range = min === max ? String(min) : min + "–" + max;
			const unknown = nodes.length - known.length;
			return "共 " + nodes.length + " 篇 · " + range + (unknown > 0 ? "（另有 " + unknown + " 篇年份未知）" : "");
		}
		// src/client/components/TimelineView.tsx
		/**
		* Timeline view: one horizontal year axis, one lane per cluster, one dot per paper.
		*
		* Layout maths lives in ../timeline (pure, unit-testable); this component only
		* turns it into SVG-free absolutely positioned DOM so it follows the theme
		* tokens and stays keyboard accessible.
		*
		* Vertical layout: the view owns the whole center column, so the lane area
		* flexes to fill the available height (chart >= ~55% of the panel on desktop),
		* the axis sits right below the lanes and the "year unknown" section is pinned
		* under the chart. The head is pushed right of the floating graph/timeline tab
		* switch that the workbench renders over the center column.
		*/
		ensureFeatureStyles();
		const STAGGER_ROWS = 3;
		const STAGGER_PERCENT = 10;
		function TimelineView(props) {
			const { nodes, selectedId, onSelect, onClear } = props;
			const domain = react.useMemo(() => computeYearDomain(nodes), [nodes]);
			const ticks = react.useMemo(() => computeYearTicks(domain), [domain]);
			const lanes = react.useMemo(() => buildTimelineLanes(nodes), [nodes]);
			const unknowns = react.useMemo(() => unknownYearNodes(nodes), [nodes]);
			const [hover, setHover] = react.useState(null);
			if (nodes.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lgf-timeline",
				"data-litgraph": "timeline",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimelineHead, {
					summary: "暂无文献",
					selected: false,
					onClear
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgf-timeline-empty",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgf-timeline-empty-title",
						children: "时间轴还没有数据"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgf-timeline-empty-hint",
						children: "导入论文后，这里会按年份排布每篇文献；AI 没能识别年份的文献会单独列在下方。"
					})]
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lgf-timeline",
				"data-litgraph": "timeline",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimelineHead, {
					summary: timelineSummary(nodes),
					selected: selectedId !== null,
					onClear
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "lgf-timeline-body lg-scroll",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lgf-timeline-plot",
						style: { minWidth: 560 },
						children: [lanes.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lgf-lanes",
							children: lanes.map((lane) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-lane",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "lgf-lane-label",
									title: lane.label,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
											className: "lgf-lane-dot",
											style: {
												background: lane.color,
												color: lane.color
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: lane.label }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", {
											className: "lgf-lane-count",
											children: lane.items.length
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "lgf-lane-track",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lgf-lane-line",
											"aria-hidden": "true"
										}),
										ticks.map((year) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lgf-grid-line",
											style: { left: yearToPercent(year, domain) + "%" },
											"aria-hidden": "true"
										}, "grid-" + year)),
										lane.items.map((node, index) => {
											const percent = yearToPercent(node.year === null ? domain.min : node.year, domain);
											const rows = Math.min(STAGGER_ROWS, lane.items.length);
											const offset = rows === 1 ? 0 : (index % rows - (rows - 1) / 2) * STAGGER_PERCENT;
											const selected = node.id === selectedId;
											const hovered = hover !== null && hover.id === node.id;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "lgf-point" + (selected ? " is-selected" : ""),
												style: {
													left: percent + "%",
													top: "calc(50% + " + offset + "%)",
													background: node.color || "#7fd1ff",
													color: node.color || "#7fd1ff"
												},
												"aria-label": pointLabel(node),
												"aria-pressed": selected,
												title: pointLabel(node),
												onMouseEnter: () => setHover({
													id: node.id,
													percent,
													offset
												}),
												onMouseLeave: () => setHover((current) => current && current.id === node.id ? null : current),
												onFocus: () => setHover({
													id: node.id,
													percent,
													offset
												}),
												onBlur: () => setHover((current) => current && current.id === node.id ? null : current),
												onClick: () => onSelect(node.id)
											}), hovered ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "lg-tooltip lgf-timeline-tip",
												style: {
													left: percent + "%",
													top: "calc(50% + " + offset + "%)"
												},
												role: "tooltip",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "lg-tooltip-title",
													children: node.title
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "lg-tooltip-meta",
													children: [node.year === null ? "年份未知" : node.year + " 年", node.clusterLabel ? " · " + node.clusterLabel : ""]
												})]
											}) : null] }, node.id);
										})
									]
								})]
							}, lane.label))
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgf-axis",
							"aria-hidden": "true",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "lgf-axis-spacer" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-axis-track",
								children: ticks.map((year, index) => {
									const percent = yearToPercent(year, domain);
									const isFirst = index === 0;
									const isLast = index === ticks.length - 1;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lgf-axis-label",
										style: {
											left: percent + "%",
											transform: isFirst ? "translateX(0)" : isLast ? "translateX(-100%)" : "translateX(-50%)"
										},
										children: year
									}, "tick-" + year);
								})
							})]
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgf-timeline-empty",
							style: {
								flex: "0 0 auto",
								padding: "18px 8px"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-timeline-empty-title",
								children: "暂无可定位年份的文献"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-timeline-empty-hint",
								children: "AI 没有从这些论文中识别出年份，已列在下方「年份未知」中。"
							})]
						}), unknowns.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgf-unknown",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgf-unknown-title",
								children: [
									"年份未知（",
									unknowns.length,
									" 篇）"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgf-unknown-list",
								children: unknowns.map((node) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "lgf-unknown-chip" + (node.id === selectedId ? " is-selected" : ""),
									title: node.title,
									onClick: () => onSelect(node.id),
									children: node.title
								}, node.id))
							})]
						}) : null]
					})
				})]
			});
		}
		function TimelineHead(props) {
			const { summary, selected, onClear } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lgf-timeline-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgf-timeline-heading",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgf-timeline-title",
						children: "时间轴"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgf-timeline-sub",
						children: summary
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "lgf-timeline-actions",
					children: selected && onClear ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "lg-btn lg-btn-sm",
						onClick: onClear,
						children: "清除选中"
					}) : null
				})]
			});
		}
		function pointLabel(node) {
			const year = node.year === null ? "年份未知" : node.year + " 年";
			return node.title + "（" + year + "）";
		}
		// src/client/styles-insight.ts
		/**
		* Insight (洞察) stylesheet. Injected once by ensureInsightStyles(); all classes
		* use the lgi- prefix, and colours come from the shared --lg-* tokens so the
		* view follows the dark / light palette and the font-size scale.
		*/
		const INSIGHT_STYLE_ID = "dsh-litgraph-insight-styles";
		const INSIGHT_CSS = String.raw`
.lgi-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.lgi-toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  /* The workbench tab pill floats at top-left of the center panel; keep the
     insight controls below it. */
  flex: 0 0 auto; padding: 58px 14px 9px; border-bottom: 1px solid var(--lg-border);
}
.lgi-seg {
  display: inline-flex; flex: 0 0 auto; overflow: hidden;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-panel-raised);
}
.lgi-seg-btn {
  padding: 5px 11px; border: 0; border-right: 1px solid var(--lg-border);
  background: transparent; color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(11.5px * var(--lg-fs-scale));
  cursor: pointer; transition: background 120ms ease, color 120ms ease;
}
.lgi-seg-btn:last-child { border-right: 0; }
.lgi-seg-btn:hover { background: var(--lg-hover); color: var(--lg-text); }
.lgi-seg-btn.is-active { background: var(--lg-cyan-soft); color: var(--lg-text); box-shadow: inset 0 -2px 0 var(--lg-cyan); }
.lgi-seg-btn:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: -2px; }
.lgi-select {
  flex: 0 0 auto; padding: 5px 8px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-panel-raised); color: var(--lg-text);
  font-family: var(--lg-font); font-size: calc(11.5px * var(--lg-fs-scale));
}
.lgi-select:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }
.lgi-spacer { flex: 1 1 auto; }
.lgi-meta { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap; }
.lgi-scroll {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  display: flex; flex-direction: column; gap: 16px;
  padding: 14px 16px 26px; box-sizing: border-box;
}
.lgi-hero { display: flex; flex-direction: column; gap: 3px; }
.lgi-hero-title {
  display: flex; align-items: center; gap: 8px;
  font-size: calc(16px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-text);
}
.lgi-hero-badge {
  padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--lg-cyan-border); background: var(--lg-cyan-soft); color: var(--lg-cyan);
  font-size: calc(10px * var(--lg-fs-scale)); font-weight: 500; letter-spacing: 0.3px;
}
.lgi-hero-sub { font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1.6; }
.lgi-note {
  padding: 8px 10px; border-radius: var(--lg-radius-sm);
  border: 1px solid var(--lg-warn-border); background: var(--lg-warn-soft);
  color: var(--lg-warn); font-size: calc(11.5px * var(--lg-fs-scale)); line-height: 1.65;
}
.lgi-section { display: flex; flex-direction: column; gap: 7px; }
.lgi-section-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.lgi-section-title { font-size: calc(13px * var(--lg-fs-scale)); font-weight: 650; color: var(--lg-text); letter-spacing: 0.3px; }
.lgi-section-hint { font-size: calc(10.5px * var(--lg-fs-scale)); color: var(--lg-dim); }
.lgi-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.lgi-chip {
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lg-border);
  background: var(--lg-chip-bg); color: var(--lg-muted);
  font-family: var(--lg-font); font-size: calc(10.5px * var(--lg-fs-scale)); cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.lgi-chip:hover { color: var(--lg-text); border-color: var(--lg-cyan-border); background: var(--lg-cyan-soft); }
.lgi-chip:focus-visible { outline: 2px solid var(--lg-ring); outline-offset: 1px; }
.lgi-chip.is-static { cursor: default; }
.lgi-method {
  display: grid; grid-template-columns: minmax(130px, 1.05fr) minmax(80px, 1fr) auto;
  gap: 10px; align-items: center; padding: 8px 10px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm);
  background: var(--lg-panel-raised);
}
.lgi-method-name {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
  font-size: calc(12.5px * var(--lg-fs-scale)); color: var(--lg-text); font-weight: 550;
}
.lgi-method-title {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere;
}
.lgi-method-note {
  font-size: calc(10px * var(--lg-fs-scale)); font-weight: 400; color: var(--lg-dim);
  line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.lgi-bar { position: relative; height: 7px; border-radius: 999px; background: var(--lg-chip-bg); overflow: hidden; }
.lgi-bar-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--lg-cyan), var(--lg-accent));
  transition: width 220ms ease;
}
.lgi-method-meta {
  display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 6px;
  font-size: calc(10px * var(--lg-fs-scale)); color: var(--lg-dim); white-space: nowrap;
}
.lgi-trend {
  padding: 0 6px; border-radius: 999px; border: 1px solid var(--lg-border);
  font-size: calc(9.5px * var(--lg-fs-scale)); line-height: 1.7;
}
.lgi-trend[data-trend='new'] { border-color: var(--lg-accent-border); background: var(--lg-accent-soft); color: var(--lg-accent); }
.lgi-trend[data-trend='rising'] { border-color: var(--lg-success-border); background: var(--lg-success-soft); color: var(--lg-success); }
.lgi-trend[data-trend='cooling'] { border-color: var(--lg-border); background: var(--lg-chip-bg); color: var(--lg-dim); }
.lgi-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.lgi-list {
  margin: 0; padding-left: 18px;
  display: flex; flex-direction: column; gap: 4px;
  font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1.65;
}
.lgi-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
.lgi-card {
  display: flex; flex-direction: column; gap: 6px; padding: 10px 11px;
  border: 1px solid var(--lg-border); border-radius: var(--lg-radius);
  background: var(--lg-panel-raised);
}
.lgi-card-title { font-size: calc(12.5px * var(--lg-fs-scale)); font-weight: 600; color: var(--lg-text); line-height: 1.45; }
.lgi-card-body { font-size: calc(11px * var(--lg-fs-scale)); color: var(--lg-muted); line-height: 1.65; }
.lgi-card-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: auto; }
.lgi-text-btn {
  border: 0; background: transparent; padding: 2px 3px;
  color: var(--lg-cyan); font-family: var(--lg-font);
  font-size: calc(10.5px * var(--lg-fs-scale)); cursor: pointer;
}
.lgi-text-btn:hover { text-decoration: underline; }
.lgi-text-btn:disabled { color: var(--lg-dim); cursor: progress; text-decoration: none; }
.lgi-empty {
  flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 30px; text-align: center;
}
.lgi-empty-title { font-size: calc(14px * var(--lg-fs-scale)); color: var(--lg-muted); }
.lgi-empty-hint { max-width: 400px; font-size: calc(12px * var(--lg-fs-scale)); color: var(--lg-dim); line-height: 1.7; }
.lgi-loading { display: flex; align-items: center; gap: 8px; padding: 22px 4px; color: var(--lg-muted); font-size: calc(12px * var(--lg-fs-scale)); }
.lgi-spin {
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--lg-border); border-top-color: var(--lg-cyan);
  animation: lgi-spin 900ms linear infinite;
}
@keyframes lgi-spin { to { transform: rotate(360deg); } }
.lgi-error { font-size: calc(11.5px * var(--lg-fs-scale)); color: var(--lg-danger); line-height: 1.6; }
.lgi-error-row { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 18px 4px; }
@media (max-width: 900px) {
  .lgi-scroll { padding: 11px 12px 22px; }
  .lgi-method { grid-template-columns: minmax(110px, 1fr) auto; }
  .lgi-method .lgi-bar { display: none; }
}
`;
		let insightStyleElement = null;
		/** Inject the insight stylesheet once; returns a disposer that removes it. */
		function ensureInsightStyles() {
			if (typeof document === "undefined" || !document.head) return () => {};
			if (typeof document.getElementById === "function" && document.getElementById("dsh-litgraph-insight-styles")) return () => {};
			const element = document.createElement("style");
			element.id = INSIGHT_STYLE_ID;
			element.setAttribute("data-plugin", "dsh-litgraph");
			element.textContent = INSIGHT_CSS;
			document.head.appendChild(element);
			insightStyleElement = element;
			return () => {
				if (insightStyleElement === element && element.parentNode) element.parentNode.removeChild(element);
				if (insightStyleElement === element) insightStyleElement = null;
			};
		}
		// src/client/components/InsightView.tsx
		/**
		* 洞察 tab — 数据库内论文研究趋势.
		*
		* Statistical half: method frequency / first year / recent share / trend, all
		* computed by the host from real paper years. Narrative half: one cached model
		* call per scope returns evolution, solved problems, limits, method×problem gaps
		* and open questions, each tied to evidence paper ids. Nothing here claims to be
		* the external state of the art; every card can jump back to the star map.
		*/
		ensureInsightStyles();
		const SCOPE_OPTIONS = [
			{
				value: "cluster",
				label: "当前聚类"
			},
			{
				value: "group",
				label: "同一学科"
			},
			{
				value: "all",
				label: "全部文献"
			}
		];
		const YEAR_OPTIONS = [
			3,
			5,
			10
		];
		const TREND_LABEL = {
			new: "新出现",
			rising: "升温",
			steady: "平稳",
			cooling: "退潮"
		};
		function describe$2(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		function percent(value) {
			return Math.round(value * 100) + "%";
		}
		function downloadMarkdown(data) {
			const lines = [];
			lines.push("# " + data.clusterLabel + " · 数据库内论文研究趋势");
			lines.push("");
			lines.push("范围：" + data.scopeLabel + " · 样本 " + data.sampleSize + "/" + data.readyCount + " 篇 · 近期 " + data.recentFromYear + "–" + (/* @__PURE__ */ new Date()).getFullYear() + " 年");
			lines.push("");
			lines.push("> " + data.disclaimer);
			lines.push("");
			if (data.objects.length > 0) {
				lines.push("## 共同研究对象");
				lines.push("");
				lines.push(data.objects.join("、"));
				lines.push("");
			}
			lines.push("## 方法雷达");
			lines.push("");
			lines.push("| 方法 | 篇数 | 首次出现 | 近 " + data.recentYears + " 年占比 | 趋势 | 平均评分 |");
			lines.push("| --- | --- | --- | --- | --- | --- |");
			for (const method of data.methods) lines.push("| " + method.name + " | " + method.count + " | " + (method.firstYear ?? "—") + " | " + percent(method.recentShare) + " | " + TREND_LABEL[method.trend] + " | " + (method.avgRating ?? "—") + " |");
			lines.push("");
			const list = (title, items) => {
				if (items.length === 0) return;
				lines.push("## " + title);
				lines.push("");
				for (const item of items) lines.push("- " + item);
				lines.push("");
			};
			list("方法演进", data.evolution);
			list("已解决的问题", data.solved);
			list("已知局限", data.limits);
			if (data.gaps.length > 0) {
				lines.push("## 空白组合（方法 × 问题）");
				lines.push("");
				for (const gap of data.gaps) lines.push("- **" + gap.method + " × " + gap.problem + "** — " + gap.why);
				lines.push("");
			}
			if (data.questions.length > 0) {
				lines.push("## 研究问题");
				lines.push("");
				for (const question of data.questions) lines.push("- **" + question.question + "** — " + question.why);
				lines.push("");
			}
			lines.push("## 证据论文");
			lines.push("");
			for (const paper of data.papers) lines.push("- " + paper.id + " · " + (paper.year ?? "年份未知") + " · " + paper.title);
			const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = "litgraph-insight-" + data.clusterLabel.replace(/[\\/:*?"<>|]/gu, "_") + ".md";
			anchor.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 2e3);
		}
		function InsightView(props) {
			const { graph, selectedId, onLocate, onToast, onSettingsChanged, settingsToken } = props;
			const [settings, setSettings] = react.useState(null);
			const [scope, setScope] = react.useState("cluster");
			const [years, setYears] = react.useState(3);
			const [data, setData] = react.useState(null);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [noteSaving, setNoteSaving] = react.useState(null);
			const [settingsReady, setSettingsReady] = react.useState(false);
			const abortRef = react.useRef(null);
			const precomputedRef = react.useRef(false);
			const selectedNode = graph !== null && selectedId !== null ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;
			const clusterId = selectedNode !== null ? selectedNode.clusterId : null;
			const clusterLabel = graph !== null && clusterId !== null ? graph.clusters.find((cluster) => cluster.id === clusterId)?.label ?? "" : "";
			react.useEffect(() => {
				let alive = true;
				fetchSettings().then((payload) => {
					if (!alive) return;
					setSettings(payload.settings);
					const savedScope = payload.settings.insightScope;
					if (savedScope === "cluster" || savedScope === "group" || savedScope === "all") setScope(savedScope);
					const savedYears = payload.settings.insightRecentYears;
					if (typeof savedYears === "number" && savedYears >= 1) setYears(Math.round(savedYears));
				}).catch(() => {}).finally(() => {
					if (alive) setSettingsReady(true);
				});
				return () => {
					alive = false;
				};
			}, [settingsToken]);
			const load = react.useCallback(async (refresh) => {
				if (scope === "cluster" && clusterId === null) {
					setData(null);
					setError(null);
					setLoading(false);
					return;
				}
				abortRef.current?.abort();
				const controller = new AbortController();
				abortRef.current = controller;
				setLoading(true);
				setError(null);
				try {
					const payload = await fetchInsight({
						scope,
						clusterId,
						recentYears: years,
						refresh
					}, controller.signal);
					if (controller.signal.aborted) return;
					setData(payload);
				} catch (caught) {
					if (controller.signal.aborted) return;
					setError(describe$2(caught));
				} finally {
					if (!controller.signal.aborted) setLoading(false);
				}
			}, [
				scope,
				clusterId,
				years
			]);
			react.useEffect(() => {
				if (!settingsReady) return;
				load(false);
				return () => {
					abortRef.current?.abort();
				};
			}, [load, settingsReady]);
			react.useEffect(() => {
				if (settings?.insightPrecompute !== true || graph === null || precomputedRef.current) return;
				if (scope !== "cluster") return;
				const targets = graph.clusters.filter((cluster) => cluster.id !== clusterId);
				if (targets.length === 0) return;
				precomputedRef.current = true;
				(async () => {
					let warmed = 0;
					for (const cluster of targets) try {
						await fetchInsight({
							scope: "cluster",
							clusterId: cluster.id,
							recentYears: years
						});
						warmed += 1;
					} catch {}
					if (warmed > 0) onToast?.("info", "已在后台缓存 " + warmed + " 个聚类的洞察");
				})();
			}, [
				settings,
				graph,
				scope,
				clusterId,
				years,
				onToast
			]);
			const changeScope = (next) => {
				if (next === scope) return;
				setScope(next);
				saveSettings({ insightScope: next }).then((payload) => onSettingsChanged?.(payload.settings)).catch(() => {});
			};
			const changeYears = (next) => {
				if (next === years) return;
				setYears(next);
				saveSettings({ insightRecentYears: next }).then((payload) => onSettingsChanged?.(payload.settings)).catch(() => {});
			};
			const saveToNote = async (key, title, body, paperIds) => {
				const id = paperIds[0];
				if (id === void 0 || noteSaving !== null) return;
				setNoteSaving(key);
				try {
					const paper = await fetchPaper(id);
					const block = "\n\n[洞察 " + (/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { hour12: false }) + "] " + title + "\n" + body;
					await updatePaper(id, { notes: ((paper.notes ?? "") + block).slice(0, 2e4) });
					onToast?.("success", "已写入《" + paper.title.slice(0, 22) + "》的笔记");
				} catch (caught) {
					onToast?.("error", "写入笔记失败：" + describe$2(caught));
				} finally {
					setNoteSaving(null);
				}
			};
			const canSaveNotes = settings?.insightSaveNotes !== false;
			const maxCount = data !== null && data.methods.length > 0 ? data.methods[0].count : 1;
			const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lgi-root",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgi-toolbar",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lgi-seg",
							role: "group",
							"aria-label": "洞察作用域",
							children: SCOPE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lgi-seg-btn" + (scope === option.value ? " is-active" : ""),
								"aria-pressed": scope === option.value,
								onClick: () => changeScope(option.value),
								children: option.label
							}, option.value))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							className: "lgi-select",
							value: years,
							"aria-label": "近期窗口",
							onChange: (event) => changeYears(Number(event.target.value)),
							children: YEAR_OPTIONS.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
								value,
								children: [
									"近期 ",
									value,
									" 年"
								]
							}, value))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgi-spacer" }),
						data !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "lgi-meta",
							children: [
								data.sampleSize,
								"/",
								data.readyCount,
								" 篇 · ",
								data.cached ? "缓存" : "刚生成"
							]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "lg-btn lg-btn-sm lg-btn-ghost",
							disabled: loading,
							onClick: () => void load(true),
							children: "重新生成"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "lg-btn lg-btn-sm",
							disabled: data === null,
							onClick: () => data !== null && downloadMarkdown(data),
							children: "导出 Markdown"
						})
					]
				}), scope === "cluster" && clusterId === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgi-empty",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgi-empty-title",
						children: "先选一篇文献"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgi-empty-hint",
						children: "洞察默认按「当前选中聚类」统计。在星图上点一个节点或从右侧论文库选一篇，这里会分析该聚类的方法分布与空白； 也可以把上方作用域切到「全部文献」直接看整库趋势。"
					})]
				}) : loading && data === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgi-loading",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "lgi-spin" }),
						"正在阅读 ",
						scope === "cluster" ? "「" + clusterLabel + "」" : "所选范围",
						" 的论文并生成洞察…首次约 5–20 秒，之后读缓存。"
					]
				}) : error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgi-error-row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgi-error",
						children: error
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "lg-btn lg-btn-sm",
						onClick: () => void load(true),
						children: "重试"
					})]
				}) : data !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgi-scroll",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-hero",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-hero-title",
								children: ["数据库内论文研究趋势", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-hero-badge",
									children: data.clusterLabel
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-hero-sub",
								children: [
									data.scopeLabel,
									" · 样本 ",
									data.sampleSize,
									data.truncated ? " / " + data.readyCount + " 篇（分层抽样）" : " 篇",
									" · 近 ",
									data.recentYears,
									" 年 = ",
									data.recentFromYear,
									"–",
									currentYear,
									" 年 · ",
									data.model,
									" · ",
									(data.ms / 1e3).toFixed(1),
									"s"
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lgi-note",
							children: data.disclaimer
						}),
						data.objects.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-section",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-title",
									children: "共同研究对象"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-hint",
									children: "模型从样本标题 / 关键词里归纳"
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgi-chips",
								children: data.objects.map((object) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-chip is-static",
									children: object
								}, object))
							})]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-section",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-title",
									children: "方法雷达"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "lgi-section-hint",
									children: [
										data.methods.length,
										" 种方法 · 篇数 / 首次出现年份 / 近 ",
										data.recentYears,
										" 年占比 / 平均评分"
									]
								})]
							}), data.methods.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgi-section-hint",
								children: "这批论文的方法字段为空，模型也没抽出方法名。"
							}) : data.methods.map((method) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-method",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgi-method-name",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lgi-method-title",
											title: method.name,
											children: method.name
										}), method.note !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lgi-method-note",
											children: method.note
										}) : null]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "lgi-bar",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lgi-bar-fill",
											style: { width: Math.max(6, method.count / maxCount * 100) + "%" }
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgi-method-meta",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [method.count, " 篇"] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: method.firstYear !== null ? "首次 " + method.firstYear : "年份未知" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["近期 ", percent(method.recentShare)] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "lgi-trend",
												"data-trend": method.trend,
												children: TREND_LABEL[method.trend]
											}),
											method.avgRating !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["★ ", method.avgRating] }) : null
										]
									})
								]
							}, method.name))]
						}),
						data.evolution.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-section",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgi-section-head",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-title",
									children: "方法演进"
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: "lgi-list",
								children: data.evolution.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item }, item))
							})]
						}) : null,
						data.solved.length > 0 || data.limits.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-cols",
							children: [data.solved.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-section",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "lgi-section-head",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lgi-section-title",
										children: "已解决的问题"
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: "lgi-list",
									children: data.solved.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item }, item))
								})]
							}) : null, data.limits.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-section",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "lgi-section-head",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lgi-section-title",
										children: "论文指出的局限"
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: "lgi-list",
									children: data.limits.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item }, item))
								})]
							}) : null]
						}) : null,
						data.gaps.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-section",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-title",
									children: "空白组合"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-hint",
									children: "方法 × 问题 · 点证据回星图 · 标「推测」不入结论"
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgi-cards",
								children: data.gaps.map((gap, index) => {
									const key = "gap-" + index;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgi-card",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "lgi-card-title",
												children: [
													gap.method,
													" × ",
													gap.problem
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "lgi-card-body",
												children: gap.why
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "lgi-card-foot",
												children: [gap.paperIds.map((id) => {
													const paper = data.papers.find((entry) => entry.id === id);
													return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: "lgi-chip",
														title: paper !== void 0 ? paper.title : id,
														onClick: () => onLocate(id),
														children: paper !== void 0 ? paper.title : id
													}, id);
												}), canSaveNotes ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "lgi-text-btn",
													disabled: noteSaving !== null || gap.paperIds.length === 0,
													onClick: () => void saveToNote(key, gap.method + " × " + gap.problem, gap.why, gap.paperIds),
													children: noteSaving === key ? "写入中…" : "存笔记"
												}) : null]
											})
										]
									}, key);
								})
							})]
						}) : null,
						data.questions.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-section",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-title",
									children: "可以往下做的研究问题"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-hint",
									children: "基于本库空白组合的推测"
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgi-cards",
								children: data.questions.map((question, index) => {
									const key = "question-" + index;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lgi-card",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "lgi-card-title",
												children: question.question
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "lgi-card-body",
												children: question.why
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "lgi-card-foot",
												children: [question.paperIds.map((id) => {
													const paper = data.papers.find((entry) => entry.id === id);
													return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: "lgi-chip",
														title: paper !== void 0 ? paper.title : id,
														onClick: () => onLocate(id),
														children: paper !== void 0 ? paper.title : id
													}, id);
												}), canSaveNotes ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "lgi-text-btn",
													disabled: noteSaving !== null || question.paperIds.length === 0,
													onClick: () => void saveToNote(key, question.question, question.why, question.paperIds),
													children: noteSaving === key ? "写入中…" : "存笔记"
												}) : null]
											})
										]
									}, key);
								})
							})]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lgi-section",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lgi-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-title",
									children: "样本论文"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lgi-section-hint",
									children: "点任意一篇回星图定位"
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lgi-chips",
								children: data.papers.map((paper) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "lgi-chip",
									title: paper.title,
									onClick: () => onLocate(paper.id),
									children: [paper.year !== null ? paper.year + " · " : "", paper.title]
								}, paper.id))
							})]
						})
					]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lgi-empty",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgi-empty-title",
						children: "还没有生成洞察"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lgi-empty-hint",
						children: "选一个聚类或切换到「全部文献」，然后点「重新生成」。"
					})]
				})]
			});
		}
		// src/client/styles-zotero.ts
		/**
		* Zotero import dialog styles.
		*
		* Self-contained: the component injects this stylesheet under its own <style id>
		* and the dialog portals to <body>, i.e. outside .lg-root, so page theme
		* variables do not reach it. The tokens below are therefore defined on the
		* overlay itself (dark by default, light via [data-lg-theme='light']) and the
		* overlay attribute mirrors .lg-root's data-lg-theme.
		*/
		const ZOTERO_STYLE_ID = "dsh-litgraph-zotero";
		const ZOTERO_CSS = String.raw`
.lg-zot-backdrop {
  color-scheme: dark;
  /* self-contained dark tokens (portal escapes .lg-root) */
  --lg-panel-solid: #0b1222;
  --lg-border: rgba(120, 150, 200, 0.2);
  --lg-border-strong: rgba(120, 150, 200, 0.3);
  --lg-text: #e9effb;
  --lg-muted: #a9b6cf;
  --lg-dim: #8391ab;
  --lg-accent: #ffd166;
  --lg-cyan: #7fd1ff;
  --lg-cyan-soft: rgba(127, 209, 255, 0.2);
  --lg-cyan-border: rgba(127, 209, 255, 0.32);
  --lg-danger: #ff7a85;
  --lg-success: #7ee787;
  --lg-success-soft: rgba(126, 231, 135, 0.08);
  --lg-success-border: rgba(126, 231, 135, 0.36);
  --lg-warn: #ffd166;
  --lg-warn-soft: rgba(255, 209, 102, 0.08);
  --lg-warn-border: rgba(255, 209, 102, 0.34);
  --lg-radius-lg: 16px;
  --lg-scrim: rgba(4, 8, 18, 0.64);
  --lg-foot-bg: rgba(7, 12, 24, 0.68);
  --lg-dialog-shadow: 0 30px 90px rgba(0, 0, 0, 0.66), inset 0 0 0 1px rgba(127, 209, 255, 0.04);
  --lg-input-bg: rgba(10, 17, 32, 0.85);
  --lg-input-border: rgba(120, 150, 200, 0.24);
  --lg-btn-bg: rgba(18, 28, 48, 0.85);
  --lg-btn-bg-hover: rgba(32, 48, 78, 0.9);
  --lg-hover: rgba(30, 44, 72, 0.42);
  --lg-hover-strong: rgba(30, 44, 72, 0.72);
  --lg-selected-bg: rgba(127, 209, 255, 0.08);
  --lg-selected-border: rgba(127, 209, 255, 0.34);
  --lg-chip-bg: rgba(127, 209, 255, 0.06);
  --lg-scrollbar: rgba(120, 150, 200, 0.35);
  --lg-mark-bg: rgba(127, 209, 255, 0.26);
  --lg-glyph-bg: linear-gradient(135deg, rgba(127, 209, 255, 0.22), rgba(255, 209, 102, 0.16));
  --lg-glyph-border: rgba(127, 209, 255, 0.32);
  --lg-primary-bg: linear-gradient(180deg, rgba(255, 209, 102, 0.94), rgba(240, 184, 66, 0.94));
  --lg-primary-bg-hover: linear-gradient(180deg, #ffd980, #f5c253);
  --lg-primary-border: rgba(255, 209, 102, 0.5);
  --lg-primary-text: #1a1405;
  --lg-mode-active-text: #ffffff;
  --lg-focus-ring: rgba(127, 209, 255, 0.35);
  --lg-search-focus-border: rgba(127, 209, 255, 0.45);
}
.lg-zot-backdrop[data-lg-theme='light'] {
  color-scheme: light;
  --lg-panel-solid: #ffffff;
  --lg-border: #d3dbe8;
  --lg-border-strong: #a9b8ce;
  --lg-text: #1b2537;
  --lg-muted: #566480;
  --lg-dim: #69758f;
  --lg-accent: #9a6b00;
  --lg-cyan: #1f6a8f;
  --lg-cyan-soft: rgba(31, 106, 143, 0.12);
  --lg-cyan-border: rgba(31, 106, 143, 0.38);
  --lg-danger: #b02a45;
  --lg-success: #0f7a4f;
  --lg-success-soft: rgba(15, 122, 79, 0.1);
  --lg-success-border: rgba(15, 122, 79, 0.35);
  --lg-warn: #8a5a00;
  --lg-warn-soft: rgba(185, 132, 20, 0.12);
  --lg-warn-border: rgba(154, 107, 0, 0.34);
  --lg-scrim: rgba(30, 44, 66, 0.32);
  --lg-foot-bg: #f4f7fc;
  --lg-dialog-shadow: 0 24px 70px rgba(37, 56, 88, 0.28), inset 0 0 0 1px rgba(31, 106, 143, 0.1);
  --lg-input-bg: rgba(255, 255, 255, 0.92);
  --lg-input-border: #cbd6e4;
  --lg-btn-bg: rgba(246, 249, 253, 0.95);
  --lg-btn-bg-hover: #e7eef8;
  --lg-hover: rgba(31, 106, 143, 0.08);
  --lg-hover-strong: rgba(31, 106, 143, 0.12);
  --lg-selected-bg: rgba(31, 106, 143, 0.1);
  --lg-selected-border: rgba(31, 106, 143, 0.4);
  --lg-chip-bg: rgba(31, 106, 143, 0.08);
  --lg-scrollbar: rgba(95, 117, 148, 0.38);
  --lg-mark-bg: rgba(31, 106, 143, 0.22);
  --lg-glyph-bg: linear-gradient(135deg, rgba(31, 106, 143, 0.14), rgba(217, 155, 0, 0.12));
  --lg-glyph-border: rgba(31, 106, 143, 0.3);
  --lg-primary-bg: linear-gradient(180deg, #ffd166, #efb83e);
  --lg-primary-bg-hover: linear-gradient(180deg, #ffdb85, #f5c253);
  --lg-primary-border: rgba(154, 107, 0, 0.45);
  --lg-primary-text: #241a00;
  --lg-mode-active-text: #1f6a8f;
  --lg-focus-ring: rgba(31, 106, 143, 0.3);
  --lg-search-focus-border: rgba(31, 106, 143, 0.45);
}
.lg-zot-backdrop {
  position: fixed; inset: 0; z-index: 1200;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; background: var(--lg-scrim); backdrop-filter: blur(6px);
}
.lg-zot-dialog {
  display: flex; flex-direction: column;
  width: min(980px, 94vw); max-height: min(88vh, 920px);
  background: var(--lg-panel-solid);
  border: 1px solid var(--lg-border-strong);
  border-radius: var(--lg-radius-lg, 16px);
  box-shadow: var(--lg-dialog-shadow);
  color: var(--lg-text); font-size: 13px; line-height: 1.5; overflow: hidden;
  animation: lg-zot-pop 0.18s ease-out;
}
@keyframes lg-zot-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.lg-zot-head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 18px 12px; border-bottom: 1px solid var(--lg-border);
  flex: 0 0 auto;
}
.lg-zot-glyph {
  flex: 0 0 auto; width: 32px; height: 32px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; font-family: Georgia, 'Times New Roman', serif;
  color: var(--lg-cyan);
  background: var(--lg-glyph-bg);
  border: 1px solid var(--lg-glyph-border);
}
.lg-zot-heading { flex: 1 1 auto; min-width: 0; }
.lg-zot-title { font-size: 15px; font-weight: 600; letter-spacing: 0.3px; }
.lg-zot-sub {
  margin-top: 2px; font-size: 11px; color: var(--lg-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lg-zot-icon-btn {
  flex: 0 0 auto; width: 28px; height: 28px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; background: transparent; color: var(--lg-muted);
  cursor: pointer; padding: 0;
}
.lg-zot-icon-btn:hover { background: var(--lg-hover-strong); color: var(--lg-text); }
.lg-zot-icon-btn[disabled] { opacity: 0.4; cursor: not-allowed; }
.lg-zot-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 18px; border-bottom: 1px solid var(--lg-border);
  flex: 0 0 auto;
}
.lg-zot-search {
  flex: 1 1 240px; display: flex; align-items: center; gap: 6px; height: 30px;
  padding: 0 9px; border-radius: 8px;
  border: 1px solid var(--lg-input-border);
  background: var(--lg-input-bg); color: var(--lg-dim);
}
.lg-zot-search:focus-within { border-color: var(--lg-search-focus-border); }
.lg-zot-search input {
  flex: 1 1 auto; min-width: 0; height: 100%; border: none; outline: none; background: transparent;
  color: var(--lg-text); font-size: 12px; font-family: inherit;
}
.lg-zot-search input::placeholder { color: var(--lg-dim); }
.lg-zot-mode { display: inline-flex; border: 1px solid var(--lg-border); border-radius: 8px; overflow: hidden; }
.lg-zot-mode-btn {
  height: 30px; padding: 0 11px; border: none; background: transparent;
  color: var(--lg-muted); font-size: 11.5px; font-family: inherit; cursor: pointer; white-space: nowrap;
}
.lg-zot-mode-btn:hover { background: var(--lg-hover-strong); color: var(--lg-text); }
.lg-zot-mode-btn.is-active { background: var(--lg-cyan-soft); color: var(--lg-mode-active-text); box-shadow: inset 0 0 0 1px var(--lg-cyan-border); }
.lg-zot-btn {
  height: 30px; padding: 0 13px; border-radius: 8px;
  border: 1px solid var(--lg-border-strong);
  background: var(--lg-btn-bg); color: var(--lg-text);
  font-size: 12px; font-family: inherit; cursor: pointer; white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.lg-zot-btn:hover { background: var(--lg-btn-bg-hover); border-color: var(--lg-cyan-border); }
.lg-zot-btn[disabled] { opacity: 0.42; cursor: not-allowed; }
.lg-zot-btn.is-primary {
  border-color: var(--lg-primary-border);
  background: var(--lg-primary-bg);
  color: var(--lg-primary-text); font-weight: 600;
}
.lg-zot-btn.is-primary:hover { background: var(--lg-primary-bg-hover); border-color: var(--lg-primary-border); }
.lg-zot-btn.is-primary[disabled] { filter: grayscale(0.5); }
.lg-zot-link {
  border: none; background: transparent; color: var(--lg-cyan);
  font-size: 11px; font-family: inherit; cursor: pointer; padding: 0 2px;
}
.lg-zot-link:hover { text-decoration: underline; }
.lg-zot-warnings {
  flex: 0 0 auto; margin: 8px 18px 0; padding: 7px 11px;
  border-radius: 8px; border: 1px solid var(--lg-warn-border);
  background: var(--lg-warn-soft); color: var(--lg-warn);
  font-size: 11px; line-height: 1.65; max-height: 76px; overflow-y: auto;
}
.lg-zot-warnings-title { font-weight: 600; margin-right: 6px; }
.lg-zot-warnings div { word-break: break-word; }
.lg-zot-loading, .lg-zot-empty, .lg-zot-error {
  flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 48px 24px; text-align: center; color: var(--lg-muted); font-size: 12.5px;
}
.lg-zot-loading-hint, .lg-zot-empty-hint { color: var(--lg-dim); font-size: 11px; line-height: 1.75; max-width: 440px; }
.lg-zot-error-text { color: var(--lg-danger); font-size: 12px; line-height: 1.7; max-width: 560px; word-break: break-word; }
.lg-zot-spinner {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--lg-cyan-soft); border-top-color: var(--lg-cyan);
  animation: lg-zot-spin 0.8s linear infinite;
}
@keyframes lg-zot-spin { to { transform: rotate(360deg); } }
.lg-zot-list-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 18px; font-size: 11px; color: var(--lg-dim);
  border-bottom: 1px dashed var(--lg-border); flex: 0 0 auto;
}
.lg-zot-check-label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--lg-muted); }
.lg-zot-check-label input, .lg-zot-check { accent-color: var(--lg-cyan); width: 13px; height: 13px; cursor: pointer; }
.lg-zot-list-count { color: var(--lg-muted); }
.lg-zot-list {
  flex: 1 1 auto; min-height: 200px; overflow-y: auto; overscroll-behavior: contain;
  padding: 4px 10px 10px; scrollbar-width: thin; scrollbar-color: var(--lg-scrollbar) transparent;
}
.lg-zot-list::-webkit-scrollbar { width: 8px; }
.lg-zot-list::-webkit-scrollbar-thumb { background: var(--lg-scrollbar); border-radius: 4px; }
.lg-zot-row {
  display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px; margin-top: 2px;
  border-radius: 9px; border: 1px solid transparent; cursor: pointer; outline: none;
}
.lg-zot-row:hover { background: var(--lg-hover); }
.lg-zot-row.is-checked { border-color: var(--lg-selected-border); background: var(--lg-selected-bg); }
.lg-zot-row:focus-visible { box-shadow: 0 0 0 2px var(--lg-focus-ring); }
.lg-zot-check { margin-top: 2px; flex: 0 0 auto; }
.lg-zot-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.lg-zot-row-title {
  font-size: 12.5px; line-height: 1.45; color: var(--lg-text);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word;
}
.lg-zot-row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10.5px; color: var(--lg-dim); }
.lg-zot-row-meta > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-zot-authors { color: var(--lg-muted); max-width: 46% !important; }
.lg-zot-venue { max-width: 34% !important; }
.lg-zot-badge {
  flex: 0 0 auto; padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 17px;
  border: 1px solid var(--lg-border); color: var(--lg-muted);
}
.lg-zot-badge.is-pdf { color: var(--lg-success); border-color: var(--lg-success-border); background: var(--lg-success-soft); }
.lg-zot-badge.is-missing { color: var(--lg-warn); border-color: var(--lg-warn-border); background: var(--lg-warn-soft); }
.lg-zot-badge.is-none { color: var(--lg-dim); }
.lg-zot-chip {
  flex: 0 0 auto; padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 17px;
  border: 1px solid var(--lg-border); background: var(--lg-chip-bg);
  color: var(--lg-cyan); max-width: 160px !important;
}
.lg-zot-mark { background: var(--lg-mark-bg); color: inherit; border-radius: 2px; padding: 0 1px; }
.lg-zot-more { padding: 12px 10px 4px; text-align: center; font-size: 11px; color: var(--lg-dim); }
.lg-zot-foot {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 18px; border-top: 1px solid var(--lg-border);
  background: var(--lg-foot-bg); flex: 0 0 auto;
}
.lg-zot-foot-info { font-size: 11.5px; color: var(--lg-muted); }
.lg-zot-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.lg-zot-result { flex: 1 1 auto; overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
.lg-zot-result-summary { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 10px; background: var(--lg-cyan-soft); border: 1px solid var(--lg-cyan-border); }
.lg-zot-result-num { font-size: 26px; font-weight: 700; color: var(--lg-cyan); line-height: 1.1; }
.lg-zot-result-text { font-size: 12.5px; color: var(--lg-text); }
.lg-zot-result-hint { font-size: 11px; color: var(--lg-dim); line-height: 1.7; }
.lg-zot-result-section { display: flex; flex-direction: column; gap: 6px; }
.lg-zot-result-title { font-size: 12px; font-weight: 600; color: var(--lg-muted); }
.lg-zot-result-item { display: flex; align-items: flex-start; gap: 8px; padding: 7px 2px; border-bottom: 1px dashed var(--lg-border); font-size: 12px; }
.lg-zot-result-item:last-child { border-bottom: none; }
.lg-zot-result-item-title { flex: 1 1 auto; min-width: 0; color: var(--lg-text); word-break: break-word; }
.lg-zot-skip { color: var(--lg-warn); font-size: 11px; word-break: break-word; }
.lg-zot-error-inline { color: var(--lg-danger); font-size: 11.5px; line-height: 1.7; word-break: break-word; }
@media (max-width: 640px) {
  .lg-zot-backdrop { padding: 10px; }
  .lg-zot-dialog { width: 100%; max-height: 94vh; }
  .lg-zot-toolbar { padding: 8px 12px; }
  .lg-zot-head { padding: 12px 14px 10px; }
  .lg-zot-list, .lg-zot-result { padding-left: 8px; padding-right: 8px; }
  .lg-zot-foot { padding: 10px 12px; }
  .lg-zot-authors { max-width: 100% !important; }
  .lg-zot-venue { max-width: 100% !important; }
}
`;
		let styleElement$1 = null;
		/** Inject the dialog stylesheet once; returns a disposer that leaves it in place for other mounts. */
		function ensureZoteroStyles() {
			if (typeof document === "undefined" || !document.head) return () => {};
			if (styleElement$1 !== null && styleElement$1.isConnected) return () => {};
			const existing = typeof document.getElementById === "function" ? document.getElementById(ZOTERO_STYLE_ID) : null;
			if (existing !== null) {
				styleElement$1 = existing;
				return () => {};
			}
			const element = document.createElement("style");
			element.id = ZOTERO_STYLE_ID;
			element.setAttribute("data-plugin", "dsh-litgraph-zotero");
			element.textContent = ZOTERO_CSS;
			document.head.appendChild(element);
			styleElement$1 = element;
			return () => {};
		}
		// src/client/zoteroApi.ts
		/**
		* Client half of the Zotero bridge.
		*
		* Mirrors src/host/zotero.ts (keep both in sync). The host registers
		* POST /api/litgraph/zotero/scan and POST /api/litgraph/zotero/import
		* (wired by the host entry point); this module is the only place the
		* Zotero dialog talks to them.
		*/
		const ZOTERO_SCAN_ROUTE = "/api/litgraph/zotero/scan";
		const ZOTERO_IMPORT_ROUTE = "/api/litgraph/zotero/import";
		function describe$1(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		function readErrorMessage(payload) {
			if (payload === null || typeof payload !== "object") return "";
			const record = payload;
			for (const field of [
				"error",
				"message",
				"hint"
			]) {
				const value = record[field];
				if (typeof value === "string" && value.trim() !== "") return value.trim();
			}
			return "";
		}
		async function postJson(path, body, signal) {
			let response;
			try {
				response = await fetch(path, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
					signal
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") throw error;
				throw new ApiError("无法连接 LitGraph 宿主（" + describe$1(error) + "）", 0);
			}
			let text = "";
			try {
				text = await response.text();
			} catch {
				text = "";
			}
			let payload = null;
			if (text.trim() !== "") try {
				payload = JSON.parse(text);
			} catch {
				payload = null;
			}
			if (!response.ok) throw new ApiError(readErrorMessage(payload) || "HTTP " + response.status + (text.trim() !== "" ? " · " + text.trim().slice(0, 200) : ""), response.status);
			if (payload === null || typeof payload !== "object") throw new ApiError("宿主返回了空的 Zotero 响应", response.status);
			return payload;
		}
		/** Scan the local Zotero library (host side: local API first, then a sql.js copy of zotero.sqlite). */
		function scanZoteroLibrary(signal) {
			return postJson(ZOTERO_SCAN_ROUTE, {}, signal);
		}
		/** Import the selected item keys. mode 'pdf' parses PDFs; missing PDFs fall back to record import. */
		function importZoteroSelection(keys, mode, signal) {
			return postJson(ZOTERO_IMPORT_ROUTE, {
				keys,
				mode
			}, signal);
		}
		// src/client/components/ZoteroImport.tsx
		/**
		* Zotero import dialog (client half).
		*
		* Self-contained modal: scan the local Zotero library through the host bridge,
		* pick items, then import their PDFs and/or records into LitGraph.
		*
		* Mounting is owned by the host UI; this component receives
		* { open, onClose, onImported? } and renders nothing while open === false.
		* Styles live in src/client/styles-zotero.ts (injected on mount, lg-zot prefix).
		*/
		const VISIBLE_LIMIT = 300;
		const SOURCE_LABEL = {
			"local-api": "Zotero 本地 API",
			sqlite: "zotero.sqlite 副本"
		};
		const TYPE_LABEL = {
			journalArticle: "期刊论文",
			magazineArticle: "杂志文章",
			newspaperArticle: "报纸文章",
			conferencePaper: "会议论文",
			book: "图书",
			bookSection: "图书章节",
			thesis: "学位论文",
			report: "报告",
			preprint: "预印本",
			manuscript: "手稿",
			patent: "专利",
			standard: "标准",
			dataset: "数据集",
			document: "文档",
			webpage: "网页",
			encyclopediaArticle: "百科条目",
			dictionaryEntry: "词典条目"
		};
		function describe(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		function formatBytes(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return "";
			if (bytes < 1024) return bytes + " B";
			if (bytes < 1048576) return (bytes / 1024).toFixed(0) + " KB";
			return (bytes / 1024 / 1024).toFixed(1) + " MB";
		}
		function authorsText(creators) {
			if (creators.length === 0) return "作者未知";
			if (creators.length <= 3) return creators.join(" / ");
			return creators.slice(0, 3).join(" / ") + " 等 " + creators.length + " 人";
		}
		function typeLabel(itemType) {
			return TYPE_LABEL[itemType] ?? itemType;
		}
		function hasUsablePdf(item) {
			return item.attachment !== null && item.attachment.path !== "";
		}
		function highlight(text, query) {
			const needle = query.trim().toLowerCase();
			if (needle === "") return text;
			const haystack = text.toLowerCase();
			const parts = [];
			let from = 0;
			let index = haystack.indexOf(needle);
			let key = 0;
			while (index >= 0 && partitionGuard(key)) {
				if (index > from) parts.push(text.slice(from, index));
				parts.push(react.createElement("mark", {
					key: "m" + key,
					className: "lg-zot-mark"
				}, text.slice(index, index + needle.length)));
				from = index + needle.length;
				index = haystack.indexOf(needle, from);
				key += 1;
			}
			if (from < text.length) parts.push(text.slice(from));
			return parts.length === 0 ? text : parts;
		}
		function partitionGuard(count) {
			return count < 24;
		}
		function CloseGlyph() {
			return react.createElement("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true"
			}, react.createElement("path", {
				d: "M3.5 3.5l9 9M12.5 3.5l-9 9",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round"
			}));
		}
		function SearchGlyph() {
			return react.createElement("svg", {
				width: 13,
				height: 13,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true"
			}, react.createElement("circle", {
				cx: 7,
				cy: 7,
				r: 4.4,
				stroke: "currentColor",
				strokeWidth: 1.4
			}), react.createElement("path", {
				d: "M10.4 10.4L14 14",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round"
			}));
		}
		function ZoteroGlyph() {
			return react.createElement("span", {
				className: "lg-zot-glyph",
				"aria-hidden": "true"
			}, "Z");
		}
		function attachmentBadge(item) {
			if (item.attachment === null) return react.createElement("span", { className: "lg-zot-badge is-none" }, "无 PDF");
			if (item.attachment.path === "") return react.createElement("span", {
				className: "lg-zot-badge is-missing",
				title: item.attachment.fileName
			}, "附件缺失");
			const size = formatBytes(item.attachment.size);
			return react.createElement("span", {
				className: "lg-zot-badge is-pdf",
				title: item.attachment.path
			}, size === "" ? "PDF" : "PDF " + size);
		}
		/**
		* Read the active LitGraph theme from the shell root.
		*
		* The dialog portals to <body>, i.e. outside .lg-root, so it cannot inherit the
		* theme CSS variables; it mirrors data-lg-theme onto its own overlay instead.
		*/
		function readZoteroTheme() {
			if (typeof document === "undefined") return "dark";
			const root = document.querySelector(".lg-root");
			return (root !== null ? root.getAttribute("data-lg-theme") : null) === "light" ? "light" : "dark";
		}
		function ZoteroImport(props) {
			const { open, onClose, onImported, onToast } = props;
			const [phase, setPhase] = react.useState("idle");
			const [scan, setScan] = react.useState(null);
			const [scanError, setScanError] = react.useState("");
			const [query, setQuery] = react.useState("");
			const [mode, setMode] = react.useState("pdf");
			const [selected, setSelected] = react.useState(() => /* @__PURE__ */ new Set());
			const [importing, setImporting] = react.useState(false);
			const [importError, setImportError] = react.useState("");
			const [result, setResult] = react.useState(null);
			const [theme, setTheme] = react.useState(() => readZoteroTheme());
			const abortRef = react.useRef(null);
			const runIdRef = react.useRef(0);
			const aliveRef = react.useRef(true);
			react.useEffect(() => {
				aliveRef.current = true;
				ensureZoteroStyles();
				return () => {
					aliveRef.current = false;
					abortRef.current?.abort();
				};
			}, []);
			react.useEffect(() => {
				if (!open) return void 0;
				setTheme(readZoteroTheme());
				if (typeof MutationObserver === "undefined" || typeof document === "undefined") return void 0;
				const observer = new MutationObserver(() => setTheme(readZoteroTheme()));
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ["data-lg-theme"],
					subtree: true
				});
				return () => observer.disconnect();
			}, [open]);
			const runScan = react.useCallback(async () => {
				const runId = runIdRef.current + 1;
				runIdRef.current = runId;
				abortRef.current?.abort();
				const controller = new AbortController();
				abortRef.current = controller;
				setPhase("scanning");
				setScanError("");
				setImportError("");
				setResult(null);
				try {
					const next = await scanZoteroLibrary(controller.signal);
					if (!aliveRef.current || runIdRef.current !== runId) return;
					setScan(next);
					setPhase("ready");
					const preSelected = /* @__PURE__ */ new Set();
					for (const item of next.items) if (hasUsablePdf(item)) preSelected.add(item.key);
					setSelected(preSelected);
				} catch (error) {
					if (!aliveRef.current || runIdRef.current !== runId) return;
					if (error instanceof DOMException && error.name === "AbortError") return;
					setScan(null);
					setSelected(/* @__PURE__ */ new Set());
					setScanError(describe(error));
					setPhase("error");
				}
			}, []);
			react.useEffect(() => {
				if (!open) return;
				setQuery("");
				setMode("pdf");
				setImportError("");
				setResult(null);
				runScan();
			}, [open, runScan]);
			react.useEffect(() => {
				if (!open) return void 0;
				const onKeyDown = (event) => {
					if (event.key === "Escape" && !importing) {
						event.stopPropagation();
						onClose();
					}
				};
				window.addEventListener("keydown", onKeyDown, true);
				return () => window.removeEventListener("keydown", onKeyDown, true);
			}, [
				open,
				importing,
				onClose
			]);
			const items = scan !== null ? scan.items : EMPTY_ITEMS;
			const filtered = react.useMemo(() => {
				const needle = query.trim().toLowerCase();
				if (needle === "") return items;
				return items.filter((item) => {
					return [
						item.title,
						item.venue,
						item.doi,
						item.creators.join(" "),
						item.collections.join(" "),
						item.tags.join(" ")
					].join(" ").toLowerCase().indexOf(needle) >= 0;
				});
			}, [items, query]);
			const visible = filtered.slice(0, VISIBLE_LIMIT);
			const selectedItems = items.filter((item) => selected.has(item.key));
			const selectedPdfCount = selectedItems.filter(hasUsablePdf).length;
			const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.key));
			const warnings = scan !== null ? scan.warnings : EMPTY_STRINGS;
			const toggleOne = react.useCallback((key) => {
				setSelected((previous) => {
					const next = new Set(previous);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			}, []);
			const toggleAllVisible = react.useCallback(() => {
				setSelected((previous) => {
					const next = new Set(previous);
					if (allVisibleSelected) for (const item of visible) next.delete(item.key);
					else for (const item of visible) next.add(item.key);
					return next;
				});
			}, [allVisibleSelected, visible]);
			const clearSelection = react.useCallback(() => setSelected(/* @__PURE__ */ new Set()), []);
			const runImport = react.useCallback(async () => {
				if (importing) return;
				if (selectedItems.length === 0) {
					onToast?.("info", "请先勾选要导入的 Zotero 条目");
					return;
				}
				setImporting(true);
				setImportError("");
				try {
					const next = await importZoteroSelection(selectedItems.map((item) => item.key), mode);
					if (!aliveRef.current) return;
					setResult(next);
					if (next.accepted.length > 0) onImported?.(next.accepted.length);
					const summary = "已导入 " + next.accepted.length + " 条" + (next.skipped.length > 0 ? "，跳过 " + next.skipped.length + " 条" : "");
					onToast?.(next.skipped.length > 0 ? "info" : "success", summary);
				} catch (error) {
					if (!aliveRef.current) return;
					const message = describe(error);
					setImportError(message);
					onToast?.("error", "Zotero 导入失败：" + message);
				} finally {
					if (aliveRef.current) setImporting(false);
				}
			}, [
				importing,
				mode,
				onImported,
				onToast,
				selectedItems
			]);
			const closeDialog = react.useCallback(() => {
				if (importing) return;
				abortRef.current?.abort();
				onClose();
			}, [importing, onClose]);
			if (!open) return null;
			if (typeof document === "undefined") return null;
			const handleBackdropMouseDown = (event) => {
				if (event.target === event.currentTarget) closeDialog();
			};
			const renderRow = (item) => {
				const checked = selected.has(item.key);
				const toggle = () => {
					if (!importing) toggleOne(item.key);
				};
				return react.createElement("div", {
					key: item.key,
					className: "lg-zot-row" + (checked ? " is-checked" : ""),
					role: "checkbox",
					"aria-checked": checked,
					"aria-label": item.title,
					tabIndex: 0,
					onClick: toggle,
					onKeyDown: (event) => {
						if (event.key === " " || event.key === "Enter") {
							event.preventDefault();
							toggle();
						}
					}
				}, react.createElement("input", {
					type: "checkbox",
					className: "lg-zot-check",
					checked,
					disabled: importing,
					onChange: toggle,
					onClick: (event) => event.stopPropagation(),
					tabIndex: -1
				}), react.createElement("div", { className: "lg-zot-main" }, react.createElement("div", { className: "lg-zot-row-title" }, highlight(item.title, query)), react.createElement("div", { className: "lg-zot-row-meta" }, react.createElement("span", {
					className: "lg-zot-authors",
					title: authorsText(item.creators)
				}, authorsText(item.creators)), react.createElement("span", null, item.year === null ? "年份未知" : String(item.year)), item.venue !== "" ? react.createElement("span", {
					className: "lg-zot-venue",
					title: item.venue
				}, item.venue) : null, react.createElement("span", { className: "lg-zot-badge" }, typeLabel(item.itemType)), attachmentBadge(item), item.collections.slice(0, 2).map((collection) => react.createElement("span", {
					key: "c-" + collection,
					className: "lg-zot-chip",
					title: collection
				}, collection)))));
			};
			const dialogChildren = [];
			dialogChildren.push(react.createElement("div", {
				className: "lg-zot-head",
				key: "head"
			}, ZoteroGlyph(), react.createElement("div", { className: "lg-zot-heading" }, react.createElement("div", { className: "lg-zot-title" }, "从 Zotero 导入"), react.createElement("div", {
				className: "lg-zot-sub",
				title: scan !== null ? scan.dataDir : ""
			}, scan === null ? "读取本机 Zotero 文献库（PDF + 题录）" : scan.dataDir + " · " + SOURCE_LABEL[scan.source] + " · 可导入 " + scan.items.length + " 条")), react.createElement("button", {
				type: "button",
				className: "lg-zot-icon-btn",
				onClick: closeDialog,
				disabled: importing,
				title: "关闭",
				"aria-label": "关闭"
			}, CloseGlyph())));
			if (phase === "scanning") dialogChildren.push(react.createElement("div", {
				className: "lg-zot-loading",
				key: "loading"
			}, react.createElement("span", {
				className: "lg-zot-spinner",
				"aria-hidden": "true"
			}), react.createElement("div", null, "正在扫描 Zotero 文献库…"), react.createElement("div", { className: "lg-zot-loading-hint" }, "首次扫描会复制并解析 zotero.sqlite（不会写入或锁定原库），通常需要 1-3 秒。")));
			else if (phase === "error") dialogChildren.push(react.createElement("div", {
				className: "lg-zot-error",
				key: "error"
			}, react.createElement("div", { className: "lg-zot-error-text" }, scanError || "扫描 Zotero 失败"), react.createElement("div", { className: "lg-zot-empty-hint" }, "请确认本机已安装 Zotero 7 并至少打开过一次。若数据目录不是默认的「用户目录 / Zotero」，可在宿主环境用 LITGRAPH_ZOTERO_DATA_DIR 指定。"), react.createElement("button", {
				type: "button",
				className: "lg-zot-btn",
				onClick: () => void runScan()
			}, "重试")));
			else if (result !== null) {
				const byKey = /* @__PURE__ */ new Map();
				for (const item of items) byKey.set(item.key, item);
				const acceptedRows = result.accepted.map((entry) => {
					const found = byKey.get(entry.key);
					return react.createElement("div", {
						key: "a-" + entry.key,
						className: "lg-zot-result-item"
					}, react.createElement("span", { className: "lg-zot-result-item-title" }, found !== void 0 ? found.title : entry.key), react.createElement("span", { className: "lg-zot-badge is-pdf" }, entry.jobId !== void 0 ? "后台解析中" : "已导入"));
				});
				const skippedRows = result.skipped.map((entry) => {
					const found = byKey.get(entry.key);
					return react.createElement("div", {
						key: "s-" + entry.key,
						className: "lg-zot-result-item"
					}, react.createElement("span", { className: "lg-zot-result-item-title" }, (found !== void 0 ? found.title : entry.key) + " — ", react.createElement("span", { className: "lg-zot-skip" }, entry.reason)));
				});
				dialogChildren.push(react.createElement("div", {
					className: "lg-zot-result",
					key: "result",
					"aria-live": "polite"
				}, react.createElement("div", { className: "lg-zot-result-summary" }, react.createElement("div", { className: "lg-zot-result-num" }, String(result.accepted.length)), react.createElement("div", { className: "lg-zot-result-text" }, "条已加入 LitGraph" + (result.skipped.length > 0 ? "，" + result.skipped.length + " 条被跳过" : "")), react.createElement("div", { className: "lg-zot-result-hint" }, "重复文献会按内容或标题自动去重；带 PDF 的条目会在后台解析并交给大模型分类，进度可在主界面查看。")), acceptedRows.length > 0 ? react.createElement("div", { className: "lg-zot-result-section" }, react.createElement("div", { className: "lg-zot-result-title" }, "已导入"), acceptedRows) : null, skippedRows.length > 0 ? react.createElement("div", { className: "lg-zot-result-section" }, react.createElement("div", { className: "lg-zot-result-title" }, "跳过"), skippedRows) : null, importError !== "" ? react.createElement("div", { className: "lg-zot-error-inline" }, importError) : null));
				dialogChildren.push(react.createElement("div", {
					className: "lg-zot-foot",
					key: "foot"
				}, react.createElement("div", { className: "lg-zot-foot-info" }, "导入完成。若列表没有立即刷新，可稍后按 F5 刷新页面。"), react.createElement("div", { className: "lg-zot-actions" }, react.createElement("button", {
					type: "button",
					className: "lg-zot-btn",
					onClick: () => void runScan()
				}, "再次扫描"), react.createElement("button", {
					type: "button",
					className: "lg-zot-btn is-primary",
					onClick: closeDialog
				}, "完成"))));
			} else {
				dialogChildren.push(react.createElement("div", {
					className: "lg-zot-toolbar",
					key: "toolbar"
				}, react.createElement("label", { className: "lg-zot-search" }, SearchGlyph(), react.createElement("input", {
					value: query,
					onChange: (event) => setQuery(event.target.value),
					placeholder: "搜索标题 / 作者 / 分类 / DOI",
					"aria-label": "搜索 Zotero 条目",
					disabled: importing
				})), react.createElement("div", {
					className: "lg-zot-mode",
					role: "group",
					"aria-label": "导入方式"
				}, react.createElement("button", {
					type: "button",
					className: "lg-zot-mode-btn" + (mode === "pdf" ? " is-active" : ""),
					onClick: () => setMode("pdf"),
					disabled: importing,
					title: "有 PDF 的条目走完整解析，缺 PDF 的条目自动退化为仅导入题录"
				}, "导入 PDF"), react.createElement("button", {
					type: "button",
					className: "lg-zot-mode-btn" + (mode === "meta" ? " is-active" : ""),
					onClick: () => setMode("meta"),
					disabled: importing,
					title: "只导入题录信息，不动 PDF 文件"
				}, "仅导入记录")), react.createElement("button", {
					type: "button",
					className: "lg-zot-btn",
					onClick: () => void runScan(),
					disabled: importing
				}, "重新扫描")));
				if (warnings.length > 0) {
					const shown = warnings.slice(0, 4);
					dialogChildren.push(react.createElement("div", {
						className: "lg-zot-warnings",
						key: "warnings"
					}, react.createElement("span", { className: "lg-zot-warnings-title" }, "提示"), shown.map((warning, index) => react.createElement("div", { key: "w" + index }, warning)), warnings.length > shown.length ? react.createElement("div", { key: "w-more" }, "还有 " + (warnings.length - shown.length) + " 条提示") : null));
				}
				dialogChildren.push(react.createElement("div", {
					className: "lg-zot-list-head",
					key: "list-head"
				}, react.createElement("label", { className: "lg-zot-check-label" }, react.createElement("input", {
					type: "checkbox",
					checked: allVisibleSelected,
					onChange: toggleAllVisible,
					disabled: importing || visible.length === 0
				}), "全选" + (filtered.length !== items.length ? "（当前 " + filtered.length + " 条结果）" : "")), react.createElement("span", { className: "lg-zot-list-count" }, "已选 " + selectedItems.length + " / " + items.length), selectedItems.length > 0 ? react.createElement("button", {
					type: "button",
					className: "lg-zot-link",
					onClick: clearSelection
				}, "清空选择") : null));
				dialogChildren.push(react.createElement("div", {
					className: "lg-zot-list",
					key: "list"
				}, items.length === 0 ? react.createElement("div", { className: "lg-zot-empty" }, react.createElement("div", null, "Zotero 文献库里还没有可导入的论文条目"), react.createElement("div", { className: "lg-zot-empty-hint" }, "笔记、附件、软件等非论文类型会被自动跳过。可以先去 Zotero 里添加文献，再回来点「重新扫描」。")) : visible.length === 0 ? react.createElement("div", { className: "lg-zot-empty" }, react.createElement("div", null, "没有匹配「" + query.trim() + "」的条目"), react.createElement("div", { className: "lg-zot-empty-hint" }, "换个关键词，或清空搜索框查看全部条目。")) : visible.map(renderRow), filtered.length > VISIBLE_LIMIT ? react.createElement("div", {
					className: "lg-zot-more",
					key: "more"
				}, "只显示前 300 条，请用搜索缩小范围（共 " + filtered.length + " 条）") : null));
				dialogChildren.push(react.createElement("div", {
					className: "lg-zot-foot",
					key: "foot"
				}, react.createElement("div", { className: "lg-zot-foot-info" }, "已选 " + selectedItems.length + " 条" + (mode === "pdf" && selectedItems.length > 0 ? "（其中 " + selectedPdfCount + " 条有可用 PDF" + (selectedPdfCount < selectedItems.length ? "，其余按题录导入" : "") + "）" : "") + (mode === "meta" ? " · 仅导入题录，不复制 PDF" : ""), importError !== "" ? react.createElement("div", { className: "lg-zot-error-inline" }, importError) : null), react.createElement("div", { className: "lg-zot-actions" }, react.createElement("button", {
					type: "button",
					className: "lg-zot-btn",
					onClick: closeDialog,
					disabled: importing
				}, "取消"), react.createElement("button", {
					type: "button",
					className: "lg-zot-btn is-primary",
					onClick: () => void runImport(),
					disabled: importing || selectedItems.length === 0
				}, importing ? "导入中…" : "导入所选 " + selectedItems.length + " 条"))));
			}
			return (0, react_dom.createPortal)(react.createElement("div", {
				className: "lg-zot-backdrop",
				"data-lg-theme": theme,
				onMouseDown: handleBackdropMouseDown
			}, react.createElement("div", {
				className: "lg-zot-dialog",
				role: "dialog",
				"aria-modal": "true",
				"aria-label": "从 Zotero 导入"
			}, dialogChildren)), document.body);
		}
		const EMPTY_ITEMS = [];
		const EMPTY_STRINGS = [];
		// src/client/components/Toasts.tsx
		/** Transient notifications and the import-job dock. */
		function Toasts({ toasts, jobs, onDismissToast, onDismissJob }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lg-toast-stack",
				"aria-live": "polite",
				children: [jobs.map((job) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(JobCard, {
					job,
					onDismiss: () => onDismissJob(job.id)
				}, job.id)), toasts.map((toast) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "lg-toast",
					"data-kind": toast.kind,
					role: "status",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "lg-toast-icon",
							children: toast.kind === "success" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckIcon, { size: 13 }) : toast.kind === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlertIcon, { size: 13 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoIcon, { size: 13 })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "lg-toast-text",
							children: toast.message
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "lg-toast-close",
							"aria-label": "关闭提示",
							onClick: () => onDismissToast(toast.id),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 10 })
						})
					]
				}, toast.id))]
			});
		}
		function JobCard({ job, onDismiss }) {
			const done = job.state === "done" || job.state === "failed";
			const percent = Math.max(0, Math.min(100, Math.round(job.progress)));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "lg-job",
				"data-state": job.state,
				"data-job-id": job.id,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-job-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "lg-job-title",
								children: JOB_STATE_LABEL[job.state] || job.state
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "lg-job-value",
								children: [percent, "%"]
							}),
							done ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "lg-toast-close",
								"aria-label": "关闭",
								onClick: onDismiss,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 10 })
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-job-message",
						children: job.message || (job.state === "done" ? "已完成" : "处理中…")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-job-track",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "lg-job-bar",
							style: { width: Math.max(4, percent) + "%" }
						})
					})
				]
			});
		}
		// src/client/theme.ts
		const THEME_STORAGE_KEY = "litgraph.theme";
		const FONT_STORAGE_KEY = "litgraph.fontSize";
		const THEME_MODES = [
			"system",
			"dark",
			"light"
		];
		const FONT_SIZES = [
			14,
			15,
			16
		];
		const THEME_LABELS = {
			system: "跟随系统",
			dark: "深色",
			light: "浅色"
		};
		const BASE_FONT_SIZE = 14;
		const BASE_GRAPH_LABEL_SIZE = 12.5;
		const BASE_GRAPH_CLUSTER_LABEL_SIZE = 13;
		function localStore() {
			try {
				if (typeof window === "undefined") return null;
				return window.localStorage;
			} catch {
				return null;
			}
		}
		function readMode() {
			const store = localStore();
			let raw = null;
			try {
				raw = store ? store.getItem(THEME_STORAGE_KEY) : null;
			} catch {
				raw = null;
			}
			return raw === "dark" || raw === "light" || raw === "system" ? raw : "system";
		}
		function readFontSize() {
			const store = localStore();
			let raw = null;
			try {
				raw = store ? store.getItem(FONT_STORAGE_KEY) : null;
			} catch {
				raw = null;
			}
			const numeric = raw === null ? 0 : Number.parseInt(raw, 10);
			return numeric === 15 || numeric === 16 ? numeric : BASE_FONT_SIZE;
		}
		function parseCssColor(value) {
			const text = value.trim();
			if (text === "") return null;
			if (text.charAt(0) === "#") {
				let hex = text.slice(1);
				if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split("").map((channel) => channel + channel).join("");
				if (hex.length !== 6 && hex.length !== 8) return null;
				const numeric = Number.parseInt(hex.slice(0, 6), 16);
				if (!Number.isFinite(numeric)) return null;
				return [
					Math.round(numeric >> 16 & 255),
					Math.round(numeric >> 8 & 255),
					numeric & 255
				];
			}
			const match = /^rgba?\(\s*([0-9.]+%?)[\s,]+([0-9.]+%?)[\s,]+([0-9.]+%?)/i.exec(text);
			if (!match) return null;
			const channel = (part) => {
				const numeric = Number.parseFloat(part);
				if (!Number.isFinite(numeric)) return 0;
				return part.charAt(part.length - 1) === "%" ? Math.round(numeric / 100 * 255) : Math.round(numeric);
			};
			return [
				channel(match[1]),
				channel(match[2]),
				channel(match[3])
			];
		}
		/** Resolve any CSS color (including color-mix()/oklch()) through a throwaway element. */
		function resolveCssColor(value) {
			const direct = parseCssColor(value);
			if (direct) return direct;
			if (typeof document === "undefined" || !document.body) return null;
			const probe = document.createElement("span");
			probe.style.position = "absolute";
			probe.style.opacity = "0";
			probe.style.pointerEvents = "none";
			probe.style.color = value;
			if (!probe.style.color) return null;
			document.body.appendChild(probe);
			let resolved = "";
			try {
				resolved = getComputedStyle(probe).color;
			} finally {
				document.body.removeChild(probe);
			}
			return parseCssColor(resolved);
		}
		function relativeLuminance(rgb) {
			const toLinear = (channel) => {
				const value = channel / 255;
				return value <= .03928 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
			};
			return .2126 * toLinear(rgb[0]) + .7152 * toLinear(rgb[1]) + .0722 * toLinear(rgb[2]);
		}
		function isTransparent(value) {
			const match = /^rgba\(\s*[0-9.]+\s*,\s*[0-9.]+\s*,\s*[0-9.]+\s*,\s*([0-9.]+)\s*\)$/i.exec(value.trim());
			return match !== null && Number.parseFloat(match[1]) === 0;
		}
		/**
		* Shell background, ideally via the documented `--dsw-alias-bg-base` token. The
		* workbench root (when mounted) and its ancestors are inspected first because some
		* hosts scope the theme variables on a wrapper instead of `<html>`.
		*/
		function shellBackground() {
			if (typeof document === "undefined") return null;
			const starts = [];
			if (rootElement) starts.push(rootElement);
			if (document.documentElement) starts.push(document.documentElement);
			if (document.body) starts.push(document.body);
			const visited = /* @__PURE__ */ new Set();
			for (const start of starts) {
				let element = start;
				while (element && !visited.has(element)) {
					visited.add(element);
					let token = "";
					try {
						token = getComputedStyle(element).getPropertyValue("--dsw-alias-bg-base").trim();
					} catch {
						token = "";
					}
					if (token !== "") {
						const parsed = resolveCssColor(token);
						if (parsed) return parsed;
					}
					element = element.parentElement;
				}
			}
			if (document.body) try {
				const painted = getComputedStyle(document.body).backgroundColor;
				if (painted && !isTransparent(painted)) {
					const parsed = parseCssColor(painted);
					if (parsed) return parsed;
				}
			} catch {}
			return null;
		}
		/** Resolve `system` against the shell background, then the OS preference. */
		function resolveTheme(mode) {
			if (mode !== "system") return mode;
			const background = shellBackground();
			if (background) return relativeLuminance(background) > .5 ? "light" : "dark";
			if (typeof window !== "undefined" && typeof window.matchMedia === "function") try {
				return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
			} catch {
				return "dark";
			}
			return "dark";
		}
		function round2(value) {
			return Math.round(value * 100) / 100;
		}
		function buildSnapshot() {
			const scale = fontSize / BASE_FONT_SIZE;
			return {
				mode,
				theme: resolveTheme(mode),
				fontSize,
				graphLabelSize: round2(BASE_GRAPH_LABEL_SIZE * scale),
				graphClusterLabelSize: round2(BASE_GRAPH_CLUSTER_LABEL_SIZE * scale)
			};
		}
		let rootElement = null;
		let mediaQuery = null;
		let observer = null;
		let initCount = 0;
		let mode = readMode();
		let fontSize = readFontSize();
		let snapshot = buildSnapshot();
		const listeners = /* @__PURE__ */ new Set();
		function applyToRoot() {
			if (!rootElement) return;
			rootElement.setAttribute("data-lg-theme", snapshot.theme);
			rootElement.setAttribute("data-lg-theme-mode", snapshot.mode);
			rootElement.setAttribute("data-lg-font", String(snapshot.fontSize));
			rootElement.style.setProperty("color-scheme", snapshot.theme);
		}
		function emit() {
			for (const listener of Array.from(listeners)) listener();
		}
		function refresh() {
			if (rootElement) {
				const next = buildSnapshot();
				const changed = next.mode !== snapshot.mode || next.theme !== snapshot.theme || next.fontSize !== snapshot.fontSize;
				snapshot = next;
				applyToRoot();
				if (changed) emit();
				return;
			}
			const next = buildSnapshot();
			const changed = next.mode !== snapshot.mode || next.theme !== snapshot.theme || next.fontSize !== snapshot.fontSize;
			snapshot = next;
			if (changed) emit();
		}
		function persist(key, value) {
			const store = localStore();
			try {
				if (store) store.setItem(key, value);
			} catch {}
		}
		function getThemeSnapshot() {
			return snapshot;
		}
		function subscribeTheme(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
		/** Bind the live panel root so the palette/font attributes follow the store. */
		function registerThemeRoot(element) {
			rootElement = element;
			applyToRoot();
			refresh();
		}
		/** Cycle 跟随系统 → 深色 → 浅色 and persist. */
		function cycleTheme() {
			const index = THEME_MODES.indexOf(mode);
			mode = THEME_MODES[(index + 1) % THEME_MODES.length];
			persist(THEME_STORAGE_KEY, mode);
			refresh();
			return mode;
		}
		/** Cycle 14 → 15 → 16px and persist. */
		function cycleFontSize() {
			const index = FONT_SIZES.indexOf(fontSize);
			fontSize = FONT_SIZES[(index + 1) % FONT_SIZES.length];
			persist(FONT_STORAGE_KEY, String(fontSize));
			refresh();
			return fontSize;
		}
		/**
		* Start watching the shell for theme switches (class/style changes on <html>, skin
		* stylesheet swaps) and OS colour-scheme changes; returns a disposer. Reference
		* counted because both apply() and the workbench keep it alive.
		*/
		function initTheme() {
			if (typeof window === "undefined" || typeof document === "undefined") return () => {};
			initCount += 1;
			if (initCount === 1) {
				if (typeof window.matchMedia === "function") try {
					mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
					if (typeof mediaQuery.addEventListener === "function") mediaQuery.addEventListener("change", refresh);
				} catch {
					mediaQuery = null;
				}
				if (typeof MutationObserver !== "undefined") try {
					observer = new MutationObserver(() => refresh());
					observer.observe(document.documentElement, {
						attributes: true,
						attributeFilter: [
							"class",
							"style",
							"data-theme",
							"data-dsh-theme",
							"data-dsw-theme"
						]
					});
					if (document.head) observer.observe(document.head, { childList: true });
				} catch {
					observer = null;
				}
				refresh();
			}
			let disposed = false;
			return () => {
				if (disposed) return;
				disposed = true;
				initCount = Math.max(0, initCount - 1);
				if (initCount > 0) return;
				if (mediaQuery && typeof mediaQuery.removeEventListener === "function") mediaQuery.removeEventListener("change", refresh);
				mediaQuery = null;
				if (observer) {
					observer.disconnect();
					observer = null;
				}
			};
		}
		// src/client/hooks/usePapers.ts
		/**
		* Fetch state for the library column. Aborts the in-flight request whenever the
		* query changes, so typing in the search box cannot render a stale page.
		*/
		function usePapers(input) {
			const { sort, order, page, cluster, q, pageSize, refreshToken, tag, starred, minRating } = input;
			const tagValue = tag === void 0 || tag === null ? "" : tag;
			const [pageData, setPageData] = react.useState(null);
			const [loading, setLoading] = react.useState(true);
			const [error, setError] = react.useState(null);
			react.useEffect(() => {
				const controller = new AbortController();
				let active = true;
				setLoading(true);
				setError(null);
				fetchPapers({
					sort,
					order,
					page,
					pageSize,
					q,
					cluster,
					starred: starred === true ? true : void 0,
					tag: tagValue === "" ? void 0 : tagValue,
					minRating: typeof minRating === "number" ? minRating : void 0
				}, controller.signal).then((result) => {
					if (!active) return;
					setPageData(result);
					setLoading(false);
				}).catch((reason) => {
					if (!active) return;
					if (reason && reason.name === "AbortError") return;
					setError(reason && reason.message ? reason.message : String(reason));
					setLoading(false);
				});
				return () => {
					active = false;
					controller.abort();
				};
			}, [
				sort,
				order,
				page,
				cluster,
				q,
				pageSize,
				refreshToken,
				tagValue,
				starred,
				minRating
			]);
			return {
				pageData,
				loading,
				error
			};
		}
		// src/client/styles-integration.ts
		/**
		* Cross-feature integration styles (Lead-owned glue).
		*
		* Not part of styles.ts (theme tokens/layout) nor styles-features.ts (feature
		* panels): this file only styles the workbench-level controls that switch
		* between features — the graph/timeline tabs and the Zotero entry button.
		*/
		const INTEGRATION_STYLE_ID = "dsh-litgraph-integration-styles";
		const INTEGRATION_CSS = `
/* ================= view switch (graph / timeline) ================= */
.lg-view-toggle {
  position: absolute; top: 12px; left: 12px; z-index: 6;
  display: flex; align-items: center; gap: 2px; padding: 3px;
  border-radius: 999px; border: 1px solid var(--lg-border);
  background: var(--lg-hud-bg); backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px var(--lg-shadow);
}
.lg-view-btn {
  appearance: none; border: 0; margin: 0; cursor: pointer;
  padding: 4px 12px; border-radius: 999px; background: transparent;
  color: var(--lg-muted); font-family: var(--lg-font);
  font-size: calc(12px * var(--lg-fs-scale)); font-weight: 560;
  transition: background 140ms ease, color 140ms ease;
}
.lg-view-btn:hover { color: var(--lg-text); background: var(--lg-hover); }
.lg-view-btn.is-active {
  color: var(--lg-accent-text); background: var(--lg-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lg-accent-border);
}
.lg-view-btn:focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 1px; }

/* ================= Zotero entry button ================= */
.lg-zotero-btn { gap: 6px; }
.lg-zotero-glyph {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 4px;
  background: var(--lg-accent-soft); border: 1px solid var(--lg-accent-border);
  color: var(--lg-accent-text); font-size: 10px; font-weight: 800; line-height: 1;
}
.lg-zotero-text { font-size: calc(12px * var(--lg-fs-scale)); font-weight: 560; }

/* timeline replaces the graph, so it has to own the center column height */
.lg-col-center > .lgf-timeline { flex: 1 1 auto; min-height: 0; }

@media (max-width: 900px) {
  .lg-zotero-text { display: none; }
}
`;
		let styleElement = null;
		/** Inject the integration stylesheet once; returns a disposer that removes it. */
		function ensureIntegrationStyles() {
			if (typeof document === "undefined" || !document.head) return () => {};
			if (typeof document.getElementById === "function" && document.getElementById("dsh-litgraph-integration-styles")) return () => {};
			const element = document.createElement("style");
			element.id = INTEGRATION_STYLE_ID;
			element.setAttribute("data-plugin", "dsh-litgraph");
			element.textContent = INTEGRATION_CSS;
			document.head.appendChild(element);
			styleElement = element;
			return () => {
				if (styleElement === element && element.parentNode) element.parentNode.removeChild(element);
				if (styleElement === element) styleElement = null;
			};
		}
		// src/client/Workbench.tsx
		/**
		* The LitGraph workbench: one React tree that owns the whole main panel.
		*
		*   header     brand / search / host status
		*   columns    detail (left) · star map (center) · library (right)
		*   overlays   drop veil, import-job dock, toasts
		*
		* All data flows through the host's same-origin /api/litgraph/* routes.
		*/
		ensureIntegrationStyles();
		const SEARCH_DEBOUNCE_MS = 180;
		const JOB_POLL_MS = 650;
		const MAX_MATCH_SUGGESTIONS = 8;
		let toastCounter = 0;
		/** One auto metrics backfill per plugin load (survives StrictMode remounts). */
		let autoMetricsBootstrapped = false;
		/** One auto Zotero link sync per plugin load (matches existing papers to Zotero items). */
		let autoZoteroSynced = false;
		function nextToastId() {
			toastCounter += 1;
			return "toast-" + toastCounter;
		}
		function Workbench() {
			const [graph, setGraph] = react.useState(null);
			const [graphLoading, setGraphLoading] = react.useState(true);
			const [graphError, setGraphError] = react.useState(null);
			const [seed, setSeed] = react.useState(11);
			const [status, setStatus] = react.useState(null);
			const [refreshToken, setRefreshToken] = react.useState(0);
			const [query, setQuery] = react.useState("");
			const [debouncedQuery, setDebouncedQuery] = react.useState("");
			const [selectedId, setSelectedId] = react.useState(null);
			const [detail, setDetail] = react.useState(null);
			const [detailLoading, setDetailLoading] = react.useState(false);
			const [detailError, setDetailError] = react.useState(null);
			const [deleting, setDeleting] = react.useState(false);
			const [focus, setFocus] = react.useState(null);
			const [sort, setSort] = react.useState("updatedAt");
			const [order, setOrder] = react.useState("desc");
			const [page, setPage] = react.useState(1);
			const [activeCluster, setActiveCluster] = react.useState("");
			const [activeTag, setActiveTag] = react.useState(null);
			const [starredOnly, setStarredOnly] = react.useState(false);
			const [minRating, setMinRating] = react.useState(null);
			react.useEffect(() => {
				if (!graph) return;
				if (activeCluster !== "" && !graph.clusters.some((cluster) => cluster.id === activeCluster)) {
					setActiveCluster("");
					setPage(1);
				}
			}, [graph, activeCluster]);
			const [viewMode, setViewMode] = react.useState("graph");
			const [insightSettingsToken, setInsightSettingsToken] = react.useState(0);
			const [zoteroOpen, setZoteroOpen] = react.useState(false);
			const [jobs, setJobs] = react.useState([]);
			const [toasts, setToasts] = react.useState([]);
			const [dragActive, setDragActive] = react.useState(false);
			const dragDepth = react.useRef(0);
			const timers = react.useRef(/* @__PURE__ */ new Set());
			const pollers = react.useRef(/* @__PURE__ */ new Map());
			const fileInputRef = react.useRef(null);
			const [detailOpen, setDetailOpen] = react.useState(false);
			const [libraryOpen, setLibraryOpen] = react.useState(false);
			const cards = usePapers({
				sort,
				order,
				page,
				cluster: activeCluster,
				q: debouncedQuery,
				pageSize: 20,
				refreshToken,
				tag: activeTag,
				starred: starredOnly,
				minRating
			});
			const layout = react.useMemo(() => computeLayout({
				nodes: graph ? graph.nodes : [],
				edges: graph ? graph.edges : [],
				clusters: graph ? graph.clusters : [],
				seed
			}), [graph, seed]);
			const stars = react.useMemo(() => makeStars(seed, 150), [seed]);
			const timelineNodes = react.useMemo(() => buildTimelineNodes(graph ? graph.nodes : [], graph ? graph.clusters : []), [graph]);
			const pushToast = react.useCallback((kind, message, ttl = 4200) => {
				const id = nextToastId();
				setToasts((current) => current.concat([{
					id,
					kind,
					message
				}]).slice(-4));
				if (ttl > 0 && typeof window !== "undefined") {
					const timer = window.setTimeout(() => {
						setToasts((current) => current.filter((toast) => toast.id !== id));
						timers.current.delete(timer);
					}, ttl);
					timers.current.add(timer);
				}
			}, []);
			react.useEffect(() => {
				return ensureStyles();
			}, []);
			const rootRef = react.useRef(null);
			const theme = react.useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);
			react.useEffect(() => initTheme(), []);
			react.useLayoutEffect(() => {
				registerThemeRoot(rootRef.current);
				return () => registerThemeRoot(null);
			}, []);
			react.useEffect(() => {
				if (typeof window === "undefined") return;
				const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
				return () => window.clearTimeout(timer);
			}, [query]);
			const loadGraph = react.useCallback((signal) => {
				setGraphLoading(true);
				setGraphError(null);
				return fetchGraph(signal).then((payload) => {
					setGraph(payload);
					setGraphLoading(false);
				}).catch((reason) => {
					if (reason && reason.name === "AbortError") return;
					setGraphError(messageOf(reason));
					setGraphLoading(false);
				});
			}, []);
			const loadStatus = react.useCallback((signal) => {
				fetchStatus(signal).then((payload) => setStatus(payload)).catch(() => setStatus(null));
			}, []);
			react.useEffect(() => {
				const controller = new AbortController();
				loadGraph(controller.signal);
				loadStatus(controller.signal);
				return () => controller.abort();
			}, [
				loadGraph,
				loadStatus,
				refreshToken
			]);
			react.useEffect(() => {
				if (autoMetricsBootstrapped || typeof window === "undefined") return;
				autoMetricsBootstrapped = true;
				refreshMetrics().then((result) => {
					if (result.queued <= 0) return;
					if (result.queued >= 3) pushToast("info", "正在后台自动查询 " + result.queued + " 篇文献的期刊指标…", 6e3);
					for (const delay of [
						8e3,
						25e3,
						6e4
					]) {
						const timer = window.setTimeout(() => setRefreshToken((token) => token + 1), delay);
						timers.current.add(timer);
					}
				}).catch(() => {});
			}, [pushToast]);
			react.useEffect(() => {
				if (autoZoteroSynced || typeof window === "undefined") return;
				autoZoteroSynced = true;
				syncZotero().then((result) => {
					if (!result.ok) return;
					if (result.updated !== void 0 && result.updated > 0) setRefreshToken((token) => token + 1);
				}).catch(() => {});
			}, []);
			react.useEffect(() => {
				if (!selectedId) {
					setDetail(null);
					setDetailError(null);
					setDetailLoading(false);
					return;
				}
				const controller = new AbortController();
				setDetailLoading(true);
				setDetailError(null);
				fetchPaper(selectedId, controller.signal).then((payload) => {
					setDetail(payload);
					setDetailLoading(false);
				}).catch((reason) => {
					if (reason && reason.name === "AbortError") return;
					setDetailError(messageOf(reason));
					setDetailLoading(false);
				});
				return () => controller.abort();
			}, [selectedId, refreshToken]);
			react.useEffect(() => {
				if (!graph || !selectedId) return;
				if (!graph.nodes.some((node) => node.id === selectedId)) {
					setSelectedId(null);
					setDetail(null);
				}
			}, [graph, selectedId]);
			react.useEffect(() => {
				setPage(1);
			}, [
				debouncedQuery,
				activeCluster,
				activeTag,
				starredOnly,
				sort,
				order
			]);
			react.useEffect(() => {
				return () => {
					for (const timer of timers.current) window.clearTimeout(timer);
					timers.current.clear();
					for (const timer of pollers.current.values()) window.clearTimeout(timer);
					pollers.current.clear();
				};
			}, []);
			const matches = react.useMemo(() => {
				if (!graph || debouncedQuery === "") return null;
				const needle = debouncedQuery.toLowerCase();
				const ids = /* @__PURE__ */ new Set();
				for (const node of graph.nodes) if ([
					node.title,
					node.clusterLabel,
					node.categories.join(" "),
					node.year === null ? "" : String(node.year)
				].join(" ").toLowerCase().indexOf(needle) >= 0) ids.add(node.id);
				return ids;
			}, [graph, debouncedQuery]);
			const suggestions = react.useMemo(() => {
				if (!graph || !matches) return [];
				return graph.nodes.filter((node) => matches.has(node.id)).sort((a, b) => b.degree - a.degree).slice(0, MAX_MATCH_SUGGESTIONS);
			}, [graph, matches]);
			const totalNodes = graph ? graph.nodes.length : 0;
			const matchCount = matches ? matches.size : 0;
			const selectPaper = (id) => {
				setSelectedId(id);
				if (id) {
					setDetailOpen(true);
					setLibraryOpen(false);
				}
			};
			const focusNode = (id) => {
				setSelectedId(id);
				setFocus({
					id,
					token: Date.now()
				});
				setDetailOpen(true);
			};
			const locateNode = (id) => {
				setFocus({
					id,
					token: Date.now()
				});
				setDetailOpen(false);
				setLibraryOpen(false);
			};
			const locateFromInsight = (id) => {
				setViewMode("graph");
				setSelectedId(id);
				setFocus({
					id,
					token: Date.now()
				});
				setDetailOpen(true);
				setLibraryOpen(false);
			};
			const relayout = () => {
				setSeed((current) => current + 1);
				pushToast("info", "正在用新的随机种子重新计算布局…", 2400);
			};
			const openFile = (id) => {
				openPaper(id).then((result) => {
					if (result.ok) {
						const message = result.via === "zotero" ? "已在 Zotero 中打开" : result.via === "retainpdf" ? "已导入并在 RetainPDF 中打开" : "已用系统默认阅读器打开";
						pushToast("success", message, 2400);
						return;
					}
					pushToast("error", result.error === "no file" ? "这篇只有题录，没有本地 PDF 文件" : "打开失败：" + (result.error ?? "未知原因"), 3600);
				}).catch((reason) => pushToast("error", "打开失败：" + messageOf(reason)));
			};
			const removePaper = (id, title) => {
				if (typeof window === "undefined") return;
				if (!window.confirm("确定删除《" + title + "》？这会同时从图谱中移除。")) return;
				setDeleting(true);
				deletePaper(id).then(() => {
					pushToast("success", "已删除《" + truncate(title, 28) + "》");
					setRefreshToken((value) => value + 1);
					if (selectedId === id) {
						setSelectedId(null);
						setDetail(null);
						setFocus(null);
					}
				}).catch((reason) => pushToast("error", "删除失败：" + messageOf(reason))).finally(() => setDeleting(false));
			};
			const reloadAfterBatchDelete = (ids) => {
				if (ids.length === 0) return;
				setRefreshToken((value) => value + 1);
				loadGraph();
				loadStatus();
				if (selectedId !== null && ids.includes(selectedId)) {
					setSelectedId(null);
					setDetail(null);
					setFocus(null);
				}
			};
			const refreshAll = () => {
				setRefreshToken((value) => value + 1);
				loadGraph();
				loadStatus();
			};
			const applyPaperPatch = (paper) => {
				setDetail((current) => current !== null && current.id === paper.id ? {
					...current,
					notes: paper.notes,
					tags: paper.tags,
					starred: paper.starred,
					rating: paper.rating,
					metrics: paper.metrics,
					zotero: paper.zotero
				} : current);
				setRefreshToken((value) => value + 1);
			};
			const filterByTag = (tag) => {
				setActiveTag((current) => current === tag ? null : tag);
				setStarredOnly(false);
				setPage(1);
			};
			const startJobPoll = react.useCallback((jobId) => {
				const tick = () => {
					fetchJob(jobId).then((job) => {
						setJobs((current) => upsertJob(current, job));
						if (job.state === "done" || job.state === "failed") {
							const timer = pollers.current.get(jobId);
							if (timer !== void 0) window.clearTimeout(timer);
							pollers.current.delete(jobId);
							if (job.state === "done") {
								pushToast("success", "《" + jobTitle(job, jobs) + "》处理完成，图谱已更新", 5200);
								setRefreshToken((value) => value + 1);
								loadStatus();
							} else pushToast("error", "处理失败：" + (job.message || "请查看宿主日志"), 6e3);
							return;
						}
						const next = window.setTimeout(tick, JOB_POLL_MS);
						pollers.current.set(jobId, next);
					}).catch(() => {
						const next = window.setTimeout(tick, JOB_POLL_MS * 2);
						pollers.current.set(jobId, next);
					});
				};
				const first = window.setTimeout(tick, JOB_POLL_MS);
				pollers.current.set(jobId, first);
			}, [loadStatus, pushToast]);
			const importFiles = react.useCallback(async (files) => {
				if (files.length === 0) return;
				const pdfs = files.filter(isPdf);
				const skipped = files.length - pdfs.length;
				if (skipped > 0) pushToast("info", "已跳过 " + skipped + " 个非 PDF 文件", 3200);
				if (pdfs.length === 0) {
					if (skipped === 0) pushToast("info", "没有可导入的文件", 2600);
					return;
				}
				pushToast("info", "开始导入 " + pdfs.length + " 篇文献…", 2600);
				for (const file of pdfs) try {
					const accepted = await uploadPaper(file);
					setJobs((current) => upsertJob(current, {
						id: accepted.jobId,
						state: "queued",
						progress: 0,
						message: "已接收 " + file.name,
						paperId: accepted.paperId || null,
						createdAt: (/* @__PURE__ */ new Date()).toISOString(),
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					}));
					startJobPoll(accepted.jobId);
				} catch (reason) {
					pushToast("error", "上传 " + file.name + " 失败：" + messageOf(reason), 6e3);
				}
			}, [pushToast, startJobPoll]);
			const onDrop = (event) => {
				event.preventDefault();
				event.stopPropagation();
				dragDepth.current = 0;
				setDragActive(false);
				const files = collectFiles(event.dataTransfer);
				if (files.length > 0) importFiles(files);
			};
			const onDragOver = (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
				if (!dragActive) setDragActive(true);
			};
			const onDragEnter = (event) => {
				event.preventDefault();
				event.stopPropagation();
				dragDepth.current += 1;
				setDragActive(true);
			};
			const onDragLeave = (event) => {
				event.preventDefault();
				event.stopPropagation();
				dragDepth.current = Math.max(0, dragDepth.current - 1);
				if (dragDepth.current === 0) setDragActive(false);
			};
			const openFilePicker = () => fileInputRef.current && fileInputRef.current.click();
			const onFileInputChange = (event) => {
				const input = event.currentTarget;
				const files = input.files ? Array.from(input.files) : [];
				input.value = "";
				if (files.length > 0) importFiles(files);
			};
			const online = status !== null;
			const paperCount = status ? status.paperCount : totalNodes;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "lg-root",
				"data-litgraph": "workbench",
				"data-lg-theme": theme.theme,
				"data-lg-theme-mode": theme.mode,
				"data-lg-font": String(theme.fontSize),
				"data-detail-open": detailOpen ? "true" : "false",
				"data-library-open": libraryOpen ? "true" : "false",
				onDragEnter,
				onDragOver,
				onDragLeave,
				onDrop,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "lg-header",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lg-brand",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "lg-brand-mark",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConstellationIcon, { size: 20 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "lg-brand-text",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lg-brand-name",
										children: "LitGraph"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "lg-brand-sub",
										children: "文献知识图谱"
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchBar, {
								value: query,
								onChange: setQuery,
								onSubmit: () => {
									setDebouncedQuery(query.trim());
									if (suggestions[0]) focusNode(suggestions[0].id);
								},
								onPick: focusNode,
								suggestions,
								matchCount,
								total: totalNodes
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "lg-header-meta",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "lg-badge " + (online ? "is-online" : "is-offline"),
										title: online ? "宿主路由已连接 · 存储：" + status.storage : "未连接宿主路由，正在使用内置空图谱",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), online ? "宿主在线" : "离线"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "lg-meta-text",
										children: [
											paperCount,
											" 篇 · ",
											graph ? graph.clusters.length : 0,
											" 聚类"
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "lg-icon-btn lg-zotero-btn",
										title: "从 Zotero 导入（读取文献记录与 PDF）",
										"aria-label": "从 Zotero 导入",
										onClick: () => setZoteroOpen(true),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lg-zotero-glyph",
											children: "Z"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lg-zotero-text",
											children: "Zotero"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "lg-icon-btn lg-theme-btn",
										title: "主题：" + THEME_LABELS[theme.mode] + "（点击切换：跟随系统 → 深色 → 浅色）",
										"aria-label": "主题：" + THEME_LABELS[theme.mode],
										onClick: () => cycleTheme(),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ThemeGlyph, { mode: theme.mode }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lg-theme-text",
											children: THEME_LABELS[theme.mode]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "lg-icon-btn lg-font-btn",
										title: "字号：" + theme.fontSize + "px（点击切换 14 / 15 / 16）",
										"aria-label": "字号：" + theme.fontSize + "px",
										onClick: () => cycleFontSize(),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lg-font-glyph",
											children: "Aa"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "lg-font-value",
											children: theme.fontSize
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lg-icon-btn lg-mobile-toggle",
										title: "详情",
										"aria-label": "详情",
										onClick: () => {
											setDetailOpen((value) => !value);
											setLibraryOpen(false);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LayoutIcon, { size: 14 })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "lg-icon-btn lg-mobile-toggle",
										title: "论文库",
										"aria-label": "论文库",
										onClick: () => {
											setLibraryOpen((value) => !value);
											setDetailOpen(false);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetIcon, { size: 14 })
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-columns",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
								className: "lg-col-detail" + (detailOpen ? " is-open" : ""),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailPanel, {
									detail,
									loading: detailLoading,
									error: detailError,
									clusters: graph ? graph.clusters : [],
									deleting,
									onOpenFile: openFile,
									onDelete: removePaper,
									onLocate: locateNode,
									onRetry: () => setRefreshToken((value) => value + 1),
									onChanged: applyPaperPatch,
									onToast: pushToast,
									onTagFilter: filterByTag
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
								className: "lg-col-center",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lg-view-toggle",
										role: "tablist",
										"aria-label": "中央视图",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												role: "tab",
												"aria-selected": viewMode === "graph",
												className: "lg-view-btn" + (viewMode === "graph" ? " is-active" : ""),
												onClick: () => setViewMode("graph"),
												children: "星图"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												role: "tab",
												"aria-selected": viewMode === "timeline",
												className: "lg-view-btn" + (viewMode === "timeline" ? " is-active" : ""),
												onClick: () => setViewMode("timeline"),
												children: "时间轴"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												role: "tab",
												"aria-selected": viewMode === "insight",
												className: "lg-view-btn" + (viewMode === "insight" ? " is-active" : ""),
												onClick: () => setViewMode("insight"),
												children: "洞察"
											})
										]
									}),
									viewMode === "timeline" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimelineView, {
										nodes: timelineNodes,
										selectedId,
										onSelect: selectPaper,
										onClear: () => selectPaper(null)
									}) : viewMode === "insight" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InsightView, {
										graph,
										selectedId,
										onLocate: locateFromInsight,
										onToast: pushToast,
										settingsToken: insightSettingsToken
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StarMap, {
										layout,
										clusters: graph ? graph.clusters : [],
										stars,
										selectedId,
										matches,
										focus,
										loading: graphLoading,
										error: graphError,
										onSelect: selectPaper,
										onFit: () => setSeed((current) => current),
										onRelayout: relayout,
										theme: theme.theme,
										labelFontSize: theme.graphLabelSize,
										clusterLabelSize: theme.graphClusterLabelSize,
										children: graphError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "lg-graph-retry",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "lg-btn lg-btn-ghost",
												onClick: () => loadGraph(),
												children: "重试"
											})
										}) : null
									}),
									viewMode === "graph" && query.trim() !== "" && matchCount === 0 && graph ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "lg-search-empty",
										children: [
											"没有匹配「",
											query.trim(),
											"」的节点，试试作者名或关键词。"
										]
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
								className: "lg-col-library" + (libraryOpen ? " is-open" : ""),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LibraryPanel, {
									clusters: graph ? graph.clusters : [],
									activeCluster,
									sort,
									order,
									pageData: cards.pageData,
									loading: cards.loading,
									error: cards.error,
									selectedId,
									onCluster: setActiveCluster,
									onSort: setSort,
									onOrder: setOrder,
									onPage: setPage,
									onSelect: focusNode,
									onRetry: () => setRefreshToken((value) => value + 1),
									onImportClick: openFilePicker,
									starredOnly,
									onStarredOnly: (value) => {
										setStarredOnly(value);
										setPage(1);
									},
									activeTag,
									onTag: (tag) => {
										setActiveTag(tag);
										setPage(1);
									},
									onInsightSettingsChanged: () => setInsightSettingsToken((token) => token + 1),
									minRating,
									onMinRating: (value) => {
										setMinRating(value);
										setPage(1);
									},
									query: debouncedQuery,
									onToast: pushToast,
									onPaperPatched: applyPaperPatch,
									onBatchDeleted: reloadAfterBatchDelete,
									onClusterLevelChanged: () => {
										loadGraph();
										loadStatus();
										setPage(1);
									}
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: fileInputRef,
						type: "file",
						accept: "application/pdf,.pdf",
						multiple: true,
						className: "lg-file-input",
						"aria-hidden": "true",
						tabIndex: -1,
						onChange: onFileInputChange
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ZoteroImport, {
						open: zoteroOpen,
						onClose: () => setZoteroOpen(false),
						onImported: (count) => {
							pushToast("success", "已从 Zotero 导入 " + count + " 篇文献", 5200);
							refreshAll();
						},
						onToast: pushToast
					}),
					dragActive ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "lg-drop-overlay",
						"data-litgraph": "drop-overlay",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "lg-drop-card",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-drop-title",
								children: "松手导入 PDF"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "lg-drop-hint",
								children: "AI 会自动解析、理解并把它挂到星图上"
							})]
						})
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toasts, {
						toasts,
						jobs,
						onDismissToast: (id) => setToasts((current) => current.filter((toast) => toast.id !== id)),
						onDismissJob: (id) => setJobs((current) => current.filter((job) => job.id !== id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "lg-footer-hint",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "拖入 PDF 或点击「导入」 · 滚轮缩放 · 拖拽平移 · 点击节点查看详情" }), graph ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [graph.edges.length, " 条关联"] }) : null]
					})
				]
			});
		}
		function MonitorIcon({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "2.5",
					y: "4",
					width: "19",
					height: "13",
					rx: "2"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 21h8M12 17v4" })]
			});
		}
		function MoonIcon({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" })
			});
		}
		function SunIcon({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "12",
					r: "4"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" })]
			});
		}
		function ThemeGlyph({ mode, size = 14 }) {
			if (mode === "light") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SunIcon, { size });
			if (mode === "dark") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MoonIcon, { size });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MonitorIcon, { size });
		}
		function messageOf(reason) {
			if (reason instanceof ApiError) return reason.message;
			if (reason instanceof Error) return reason.message;
			return String(reason);
		}
		function upsertJob(jobs, job) {
			const index = jobs.findIndex((item) => item.id === job.id);
			if (index < 0) return jobs.concat([job]);
			const copy = jobs.slice();
			copy[index] = {
				...jobs[index],
				...job
			};
			return copy;
		}
		function jobTitle(job, jobs) {
			return job.paperId && job.paperId !== "" ? "文献" : "文献";
		}
		function collectFiles(transfer) {
			if (!transfer) return [];
			const files = [];
			if (transfer.files && transfer.files.length > 0) {
				for (let index = 0; index < transfer.files.length; index += 1) files.push(transfer.files[index]);
				return files;
			}
			if (transfer.items) for (let index = 0; index < transfer.items.length; index += 1) {
				const item = transfer.items[index];
				if (item.kind !== "file") continue;
				const file = item.getAsFile();
				if (file) files.push(file);
			}
			return files;
		}
		function truncate(value, max) {
			if (!value) return "";
			return value.length > max ? value.slice(0, max - 1) + "…" : value;
		}
		// src/client/index.ts
		const name = "litgraph-client";
		const inject = ["slots"];
		const PANEL_ID = "litgraph";
		function PanelIcon(props) {
			return react.createElement("span", {
				className: "lg-panel-icon" + (props.active ? " is-active" : ""),
				style: {
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: props.size || 18,
					height: props.size || 18
				}
			}, react.createElement(ConstellationIcon, { size: props.size || 18 }));
		}
		function apply(ctx) {
			ctx.effect(() => ensureStyles(), "litgraph: stylesheet");
			ctx.effect(() => initTheme(), "litgraph: theme");
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				label: () => "LitGraph",
				order: 40
			}, Workbench));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 40,
				label: () => "LitGraph"
			}, PanelIcon));
		}
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map