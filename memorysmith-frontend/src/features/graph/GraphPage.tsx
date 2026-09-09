import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { usePreferences } from '../../shared/store/preferences';
import { VaultBreadcrumb } from '../structure/VaultBreadcrumb';
import { GraphSkeleton } from '../../shared/components/skeletons';
import { noteAddress } from '../../shared/api/note-address';
import { folderTrailForNote } from '../structure/trail';
import type { VaultOutletContext } from '../structure/VaultLayout';
import { getVaultGraph } from '../../shared/api/backend';
import { CloseIcon, GearIcon } from '../../shared/components/icons';

interface GraphFile {
  nodes: {
    id: string;
    title: string;
    folderId: string;
    facets: Record<string, string[]>;
  }[];
  edges: [number, number][];
}

/**
 * **A node is a NOTE, and it always was.** The identifier is the `NoteId`,
 * which is the one thing two notes with the same title do not share; the title
 * is the label, and a label may repeat (RN-DSC-047). That is the honest
 * picture: a vault does hold two notes called `Índice`, and collapsing them
 * into one node would draw one and silently lose the other.
 *
 * What the drawing owes them is a way to tell them apart, and it is the folder
 * trail — which is what a hover writes beside the label.
 */
interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  /** Where the note lives, which is what tells two of one title apart. */
  folder: string;
  kind: 'note' | 'value';
  /** What this note says about itself; empty on a value node. */
  facets: Record<string, string[]>;
  /** Which colour slot a value node wears; absent on a note. */
  slot?: number;
  degree: number;
  radius: number;
}

type GraphLink = SimulationLinkDatum<GraphNode>;

/**
 * How many distinct values an attribute may have and still count as discrete:
 * above this it is a label and not a category, and drawing it would add one
 * node per note instead of showing what several notes have in common.
 */
const MAX_DISCRETE_VALUES = 24;
/**
 * Colour slots for the drawn attributes. Three, validated against the note
 * blue and against each other for colour-vision deficiency on both surfaces;
 * a fourth attribute switched on at the same time wears the Other grey.
 */
const VALUE_SLOTS = 3;

/**
 * How many neighbour names a hover writes on the drawing: a glance names a
 * handful. It is a ceiling and not a promise, since names that would land on
 * one another are dropped rather than piled up.
 *
 * A pinned group writes no such list. Holding a group is the moment you go
 * looking through it, and eighty names frozen over eighty crowded nodes is a
 * wall to read, not a group to browse. There the pointer names one node at a
 * time: the one under it.
 */
const LABELS_HOVERED = 18;

/** A date is discrete once it is a month: one node per day is a calendar. */
const YEAR_MONTH = /^(\d{4})-(\d{2})(?:-\d{2})?(?:[T ].*)?$/;
function monthOf(value: string): string {
  const match = YEAR_MONTH.exec(value);
  return match ? `${match[1]}-${match[2]}` : value;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** An attribute of the vault, as the graph sees it: its values, by frequency. */
interface Attribute {
  readonly name: string;
  /** Distinct values, most frequent first; dates already reduced to months. */
  readonly values: string[];
  readonly multivalued: boolean;
  readonly boolean: boolean;
  /** Every value is a date, so the values above are year-months. */
  readonly dateLike: boolean;
}

function attributesOf(nodes: GraphFile['nodes']): Attribute[] {
  const raw = new Map<string, string[]>();
  const multivalued = new Set<string>();

  for (const node of nodes) {
    for (const [facet, values] of Object.entries(node.facets)) {
      if (values.length === 0) continue;
      if (values.length > 1) multivalued.add(facet);
      const all = raw.get(facet) ?? [];
      all.push(...values);
      raw.set(facet, all);
    }
  }

  return [...raw.entries()]
    .map(([name, all]) => {
      // An attribute is a date only when every value is one; a single stray
      // word means the column is text that happens to hold some dates.
      const dateLike = all.every((value) => YEAR_MONTH.test(value));
      const byValue = new Map<string, number>();
      for (const value of all) {
        const key = dateLike ? monthOf(value) : value;
        byValue.set(key, (byValue.get(key) ?? 0) + 1);
      }
      const values = [...byValue.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([value]) => value);
      return {
        name,
        values,
        multivalued: multivalued.has(name),
        boolean:
          values.length <= 2 && values.every((value) => value === 'true' || value === 'false'),
        dateLike,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Which CSS custom property paints a given slot. */
function slotColor(slot: number): string {
  return slot < VALUE_SLOTS ? `var(--val-${slot + 1})` : 'var(--val-other)';
}

/** The breakpoint at which the vault sidebar becomes a drawer (styles.css). */
function narrowScreen(): boolean {
  return window.matchMedia('(max-width: 860px)').matches;
}

/**
 * Whether this device answers with a finger and not a pointer. It decides which
 * gestures the hint names: telling someone to scroll a wheel they do not have
 * is worse than saying nothing.
 */
function useTouchOnly(): boolean {
  const [touchOnly, setTouchOnly] = useState(() => window.matchMedia('(hover: none)').matches);
  useEffect(() => {
    const media = window.matchMedia('(hover: none)');
    const apply = () => setTouchOnly(media.matches);
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return touchOnly;
}

export function GraphPage() {
  const { t } = useTranslation();
  const touchOnly = useTouchOnly();
  const navigate = useNavigate();
  const { vaultSlug = '' } = useParams();
  const { structure } = useOutletContext<VaultOutletContext>();
  /**
   * The address of a node, built from the identifier the graph draws: the
   * folder trail and the label are decoration, and the tree the page already
   * loaded is where they come from (RN-DSC-045).
   */
  const addressOfNote = useCallback(
    (noteId: string): string | null => {
      const trail = folderTrailForNote(structure.folders, noteId);
      const folder = trail[trail.length - 1];
      if (!folder) return null;
      const note = folder.notes.find((each) => each.id === noteId);
      return noteAddress(vaultSlug, folder.slugPath, note?.title ?? null, noteId);
    },
    [structure, vaultSlug],
  );
  const theme = usePreferences((s) => s.theme);
  const [truncated, setTruncated] = useState(false);
  /**
   * The attributes whose values are drawn as nodes, each with the colour slot
   * it holds. It is a set and not a choice: every attribute is switched on by
   * itself, and one attribute is one colour, however many values it has.
   *
   * The slot is decided when the attribute is switched ON and held until it is
   * switched off, so turning one off never repaints the ones that stay.
   */
  const [drawn, setDrawn] = useState<readonly { name: string; slot: number }[]>([]);
  /**
   * The panel floats over the drawing, so on a narrow screen it starts closed:
   * there the graph is the whole screen, and a panel that opens on top of it
   * uncalled hides the thing the person came to look at.
   */
  const [controlsOpen, setControlsOpen] = useState(() => !narrowScreen());
  const [data, setData] = useState<GraphFile | null>(null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    nodes: GraphNode[];
    links: GraphLink[];
    neighbors: Map<GraphNode, Set<GraphNode>>;
    sim: Simulation<GraphNode, GraphLink> | null;
    transform: { x: number; y: number; k: number };
    hovered: GraphNode | null;
    /**
     * The value node whose group is held on the drawing. Hovering shows a
     * group for as long as the pointer stays on it, which is exactly as long
     * as it takes to move the pointer off it and lose it: the moment you go
     * for one of the notes it named, it is gone. Pinning is that same
     * highlight, kept, so the group can be read and one of its notes clicked.
     * While something is pinned the drawing stops answering to hover, because
     * a highlight that still follows the pointer is not held at all.
     */
    pinned: GraphNode | null;
    /**
     * What is on the drawing at all: the held node and its group, or null for
     * the whole vault. A node outside it is not drawn, and is not under the
     * pointer either, which is the difference between hiding something and
     * merely fading it.
     */
    shown: Set<GraphNode> | null;
    redraw: (() => void) | null;
  }>({
    nodes: [],
    links: [],
    neighbors: new Map(),
    sim: null,
    transform: { x: 0, y: 0, k: 1 },
    hovered: null,
    pinned: null,
    shown: null,
    redraw: null,
  });

  /**
   * The graph is the link projection of Discovery, and each node carries the
   * portrait the facet projection keeps of that note. The backend still does
   * not interpret content (PP4): those attributes were classified by the shape
   * of the value, so the controls below offer whatever THIS vault declares,
   * and a vault that declares nothing simply shows no control.
   */
  useEffect(() => {
    let live = true;
    void getVaultGraph(vaultSlug)
      .then((graph) => {
        if (!live) return;
        setData({
          nodes: graph.nodes.map((note) => ({
            // The identifier, because two notes may carry one title and the
            // graph draws a note and never a title (RN-DSC-047).
            id: note.noteId,
            title: note.title,
            folderId: note.folderId,
            facets: note.facets ?? {},
          })),
          edges: graph.edges,
        });
        setTruncated(graph.truncated);
      })
      .catch(() => {
        // A failure is not an empty vault. Saying so is the difference between
        // "nobody has written anything" and "we could not read it".
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [vaultSlug]);

  const attributes = useMemo(() => (data ? attributesOf(data.nodes) : []), [data]);
  /**
   * What can be drawn is what is discrete: a list the note carries several of,
   * a true/false, a date reduced to its month, or any attribute with few
   * enough distinct values to be a category rather than a label.
   */
  const drawable = useMemo(
    () =>
      attributes.filter(
        (each) =>
          each.multivalued ||
          each.boolean ||
          each.dateLike ||
          each.values.length <= MAX_DISCRETE_VALUES,
      ),
    [attributes],
  );
  const dateLike = useMemo(
    () => new Set(attributes.filter((each) => each.dateLike).map((each) => each.name)),
    [attributes],
  );

  // An attribute that stops existing (another vault, a rebuilt projection)
  // must not leave a switch pointing at nothing.
  useEffect(() => {
    setDrawn((current) => {
      const kept = current.filter((each) => drawable.some((one) => one.name === each.name));
      // Same array when nothing was dropped, or this would never settle.
      return kept.length === current.length ? current : kept;
    });
  }, [drawable]);

  function toggleDrawn(name: string) {
    setDrawn((current) => {
      if (current.some((each) => each.name === name)) {
        return current.filter((each) => each.name !== name);
      }
      // The lowest free slot, so switching one off frees its colour for the
      // next attribute instead of shifting everyone along.
      const taken = new Set(current.map((each) => each.slot));
      let slot = 0;
      while (taken.has(slot)) slot += 1;
      return [...current, { name, slot }];
    });
  }

  const filtered = useMemo(() => {
    if (!data) return null;
    const folderNameOf = (noteId: string): string => {
      const trail = folderTrailForNote(structure.folders, noteId);
      return trail[trail.length - 1]?.name ?? '';
    };
    const nodes: GraphNode[] = data.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      folder: folderNameOf(n.id),
      kind: 'note' as const,
      facets: n.facets,
      degree: 0,
      radius: 3,
    }));

    const links: { source: number; target: number }[] = [];
    for (const [source, target] of data.edges) {
      if (source >= nodes.length || target >= nodes.length) continue;
      links.push({ source, target });
      const from = nodes[source];
      const to = nodes[target];
      if (from) from.degree += 1;
      if (to) to.degree += 1;
    }

    // The values of the switched-on attributes, drawn as nodes: this is what
    // makes a tag visible as the thing several notes have in common, rather
    // than a word repeated in their frontmatter. The map is keyed by attribute
    // AND value, because `type: guide` and `tags: guide` are two facts.
    const indexOfValue = new Map<string, number>();
    for (const { name: attribute, slot } of drawn) {
      const asMonth = dateLike.has(attribute);
      data.nodes.forEach((note, noteIndex) => {
        for (const raw of note.facets[attribute] ?? []) {
          const value = asMonth ? monthOf(raw) : raw;
          const key = `${attribute}:${value}`;
          let at = indexOfValue.get(key);
          if (at === undefined) {
            at = nodes.length;
            indexOfValue.set(key, at);
            nodes.push({
              id: key,
              title: value,
              // A value node lives in no folder: it is what the vault says
              // about its notes, not one of them.
              folder: '',
              kind: 'value',
              facets: {},
              slot,
              degree: 0,
              radius: 3,
            });
          }
          links.push({ source: noteIndex, target: at });
          const note0 = nodes[noteIndex];
          const value0 = nodes[at];
          if (note0) note0.degree += 1;
          if (value0) value0.degree += 1;
        }
      });
    }

    // Both grow with how much they hold, and a value node grows faster: it is
    // the thing you aim at to hold its group, and it used to be the smallest
    // mark on a drawing where every note around it was larger. A target has to
    // be hittable, and one that gathers four hundred notes has earned the size.
    for (const node of nodes) {
      node.radius =
        node.kind === 'value'
          ? Math.min(16, 3.5 + 1.6 * Math.sqrt(node.degree))
          : Math.min(13, 2.2 + 1.25 * Math.sqrt(node.degree));
    }
    return { nodes, links };
  }, [data, drawn, dateLike]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !filtered) return;
    const state = stateRef.current;
    state.sim?.stop();

    const parent = canvas.parentElement;
    let width = parent?.clientWidth ?? 900;
    let height = parent?.clientHeight ?? 640;
    let dpr = window.devicePixelRatio || 1;
    function sizeCanvas() {
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
    }
    sizeCanvas();

    const nodes = filtered.nodes.map((n) => ({ ...n }));
    const links: GraphLink[] = filtered.links.map((l) => ({ ...l }));
    state.nodes = nodes;
    state.links = links;
    state.transform = {
      x: width / 2,
      y: height / 2,
      k: Math.min(1, 600 / Math.sqrt(nodes.length) / 12),
    };
    state.hovered = null;
    // The nodes were just rebuilt, so a pin from the previous drawing points
    // at an object that is no longer on it.
    state.pinned = null;
    state.shown = null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      if (!ctx) return;
      const { x, y, k } = state.transform;
      const colors = {
        note: cssVar('--accent') || '#0f56d7',
        edge: cssVar('--text-soft') || '#6f6d64',
        label: cssVar('--text') || '#26251f',
        halo: cssVar('--bg') || '#fafaf8',
        other: cssVar('--val-other') || '#8b96a8',
      };
      // One colour per attribute, whatever its values: a tag node and a month
      // node say which attribute they came from, not which value they are.
      const bySlot = [
        cssVar('--val-1') || '#ff8a2b',
        cssVar('--val-2') || '#db2777',
        cssVar('--val-3') || '#008300',
      ];

      function nodeFill(node: GraphNode): string {
        if (node.kind !== 'value') return colors.note;
        return bySlot[node.slot ?? -1] ?? colors.other;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(x, y);
      ctx.scale(k, k);

      // A pin outranks the pointer: while one is held, moving the mouse across
      // the drawing never changes WHICH group is lit, which is the whole point
      // of holding it. The pointer keeps one job, naming what is under it.
      const pinned = state.pinned;
      const hovered = state.hovered;
      const focus = pinned ?? hovered;
      const neighborSet = focus ? state.neighbors.get(focus) : null;
      // With a group held there is nothing else on the drawing to fade: the
      // rest of the vault is not drawn at all.
      const shown = state.shown;

      ctx.globalAlpha = focus ? 0.06 : 0.14;
      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = 1 / k;
      ctx.beginPath();
      for (const link of state.links) {
        const s = link.source as GraphNode;
        const tN = link.target as GraphNode;
        // Inside a held group, the links BETWEEN its notes are drawn too: what
        // an attribute gathers is worth seeing as a shape, not only as spokes.
        if (shown ? !shown.has(s) || !shown.has(tN) : focus && s !== focus && tN !== focus)
          continue;
        ctx.moveTo(s.x ?? 0, s.y ?? 0);
        ctx.lineTo(tN.x ?? 0, tN.y ?? 0);
      }
      ctx.stroke();

      if (focus) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        for (const link of state.links) {
          const s = link.source as GraphNode;
          const tN = link.target as GraphNode;
          if (s !== focus && tN !== focus) continue;
          ctx.moveTo(s.x ?? 0, s.y ?? 0);
          ctx.lineTo(tN.x ?? 0, tN.y ?? 0);
        }
        ctx.stroke();
      }

      for (const node of state.nodes) {
        if (shown && !shown.has(node)) continue;
        // Whatever the pointer is on is never dimmed: it is about to be named,
        // and a name over a faded dot reads as a mistake.
        const dimmed = focus && node !== focus && node !== hovered && !neighborSet?.has(node);
        ctx.globalAlpha = dimmed ? 0.15 : 1;
        ctx.fillStyle = nodeFill(node);
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // The ring around the pinned node, so the drawing says whether this
      // group is being held or merely pointed at. It is drawn in ink and not
      // in the attribute's own colour, which would be a ring the same shade as
      // the disc it surrounds.
      if (pinned) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.label;
        ctx.lineWidth = 1.5 / k;
        ctx.beginPath();
        ctx.arc(pinned.x ?? 0, pinned.y ?? 0, pinned.radius + 3.5 / k, 0, Math.PI * 2);
        ctx.stroke();
      }

      /*
        Who gets named. With a group held, only the value that holds it and
        whatever the pointer is on: the highlight stays put and the pointer
        reads the group one node at a time, which is how you look for a note
        among many. A plain hover still names its neighbours, because there the
        highlight itself is already gone the moment the pointer moves.
      */
      const labelTargets = pinned
        ? [pinned, ...(hovered && hovered !== pinned ? [hovered] : [])]
        : focus
          ? [focus, ...(neighborSet ? [...neighborSet].slice(0, LABELS_HOVERED) : [])]
          : state.nodes.filter((n) => n.kind === 'note' && n.degree >= 25).slice(0, 12);
      ctx.globalAlpha = 1;
      const fontSize = Math.max(10 / k, 4);
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.textBaseline = 'middle';
      /*
        A name that lands on another name leaves two unreadable names, and a
        held group is dozens of nodes crowded into the space of a few. So the
        boxes already written are kept, and a name that would overlap one of
        them is skipped rather than piled on top of it: the drawing shows fewer
        names than it has, and every name it shows can be read. Order decides
        who wins, and the focused node is first in the list.
      */
      const written: { x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const node of labelTargets) {
        // The focused node names the folder it lives in, which is what makes
        // two nodes carrying one title distinguishable without clicking
        // either of them (RN-DSC-047).
        const label =
          node === focus && node.kind === 'note' && node.folder
            ? `${node.title} · ${node.folder}`
            : node.title;
        const lx = (node.x ?? 0) + node.radius + 3 / k;
        const ly = node.y ?? 0;
        const box = {
          x0: lx,
          y0: ly - fontSize / 2,
          x1: lx + ctx.measureText(label).width,
          y1: ly + fontSize / 2,
        };
        const collides = written.some(
          (each) => box.x0 < each.x1 && box.x1 > each.x0 && box.y0 < each.y1 && box.y1 > each.y0,
        );
        if (collides) continue;
        written.push(box);
        ctx.lineWidth = 3 / k;
        ctx.strokeStyle = colors.halo;
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = colors.label;
        ctx.fillText(label, lx, ly);
      }
    }

    // Held apart so holding a group can retune them: a group of forty in an
    // empty field wants more room between its nodes than one of six hundred.
    const linkForce = forceLink<GraphNode, GraphLink>(links).distance(28).strength(0.4);
    const chargeForce = forceManyBody().strength(-24);

    const sim = forceSimulation<GraphNode>(nodes)
      .force('link', linkForce)
      .force('charge', chargeForce)
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.04))
      .force('y', forceY(0).strength(0.04))
      .on('tick', draw);
    state.sim = sim;
    state.redraw = draw;

    const neighbors = new Map<GraphNode, Set<GraphNode>>();
    for (const link of links) {
      const s = link.source as GraphNode;
      const tN = link.target as GraphNode;
      if (!neighbors.has(s)) neighbors.set(s, new Set());
      if (!neighbors.has(tN)) neighbors.set(tN, new Set());
      neighbors.get(s)?.add(tN);
      neighbors.get(tN)?.add(s);
    }
    state.neighbors = neighbors;

    /**
     * Holding a group takes the rest of the vault OFF the drawing, and lets go
     * puts it back. Dimming was not enough: a node you cannot see still
     * answered the pointer, so the drawing offered notes it was hiding.
     *
     * The simulation is rescoped to the group rather than rebuilt, so the
     * nodes keep the positions they already had and open out from where they
     * stood instead of jumping. With the crowd gone they have room, and the
     * forces are widened to use it: this is the animation that spreads a group
     * out far enough to pick one note out of it.
     */
    function rescope() {
      const held = state.pinned;
      if (held) {
        const group = state.neighbors.get(held) ?? new Set<GraphNode>();
        const shown = new Set<GraphNode>([held, ...group]);
        state.shown = shown;
        linkForce.links(
          state.links.filter(
            (link) => shown.has(link.source as GraphNode) && shown.has(link.target as GraphNode),
          ),
        );
        linkForce.distance(70);
        chargeForce.strength(-160);
        sim.nodes([...shown]);
        // The group is pulled to the origin of the drawing, so the view is put
        // back over the origin: otherwise a graph someone had dragged aside
        // opens its group off screen.
        state.transform.x = width / 2;
        state.transform.y = height / 2;
      } else {
        state.shown = null;
        linkForce.links(state.links);
        linkForce.distance(28);
        chargeForce.strength(-24);
        sim.nodes(state.nodes);
      }
      sim.alpha(0.7).restart();
    }

    function toGraphSpace(event: { clientX: number; clientY: number }) {
      const rect = canvas!.getBoundingClientRect();
      const { x, y, k } = state.transform;
      return { gx: (event.clientX - rect.left - x) / k, gy: (event.clientY - rect.top - y) / k };
    }

    /**
     * What is under this point, answering with what the eye says is there.
     * Value nodes are painted over the notes, so a value under the pointer
     * wins even when a note's centre sits closer: picking by distance alone
     * opens a note the person cannot see instead of holding the group they
     * aimed at. Within one kind, the nearest centre wins.
     */
    function hitTest(gx: number, gy: number): GraphNode | null {
      let best: GraphNode | null = null;
      let bestDist = Infinity;
      for (const node of state.nodes) {
        if (state.shown && !state.shown.has(node)) continue;
        const dx = (node.x ?? 0) - gx;
        const dy = (node.y ?? 0) - gy;
        const dist = dx * dx + dy * dy;
        const hit = Math.max(node.radius + 4 / state.transform.k, 6 / state.transform.k);
        if (dist >= hit * hit) continue;
        const outranks =
          best === null ||
          (node.kind === 'value' && best.kind !== 'value') ||
          (node.kind === best.kind && dist < bestDist);
        if (!outranks) continue;
        best = node;
        bestDist = dist;
      }
      return best;
    }

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = false;

    /** Zoom around a point of the canvas, wherever the gesture came from. */
    function zoomAt(mx: number, my: number, factor: number) {
      const tr = state.transform;
      const nk = Math.min(6, Math.max(0.08, tr.k * factor));
      tr.x = mx - ((mx - tr.x) / tr.k) * nk;
      tr.y = my - ((my - tr.y) / tr.k) * nk;
      tr.k = nk;
      draw();
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      zoomAt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        event.deltaY < 0 ? 1.15 : 1 / 1.15,
      );
    }
    function onDown(event: MouseEvent) {
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
    }
    function onMove(event: MouseEvent) {
      if (dragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        state.transform.x += dx;
        state.transform.y += dy;
        lastX = event.clientX;
        lastY = event.clientY;
        draw();
        return;
      }
      const { gx, gy } = toGraphSpace(event);
      const hit = hitTest(gx, gy);
      if (hit === state.hovered) return;
      state.hovered = hit;
      canvas!.style.cursor = hit ? 'pointer' : 'grab';
      // Always repaints: with nothing held the hover moves the highlight, and
      // with a group held it moves the one name on the drawing.
      draw();
    }
    /**
     * What a click means, in the three cases there are. A note is a document
     * and opens. A value node is a grouping and holds its notes on the drawing,
     * or lets them go if it was already the one being held. Empty canvas is how
     * you let go without aiming at anything.
     */
    function onUp(event: MouseEvent) {
      dragging = false;
      if (moved) return;
      const { gx, gy } = toGraphSpace(event);
      const hit = hitTest(gx, gy);

      if (hit?.kind === 'note') {
        const url = addressOfNote(hit.id);
        if (url) void navigate(url);
        return;
      }

      const next = hit?.kind === 'value' && hit !== state.pinned ? hit : null;
      if (next === state.pinned) return;
      state.pinned = next;
      rescope();
    }
    /** The pointer leaving takes the hover with it, and never the pin: the
        held group survives the trip to the panel and back. */
    function onLeave() {
      dragging = false;
      if (!state.hovered) return;
      state.hovered = null;
      draw();
    }

    /**
     * Touch. One finger drags the graph, two pinch it, and a finger that lands
     * and lifts without travelling is a tap that opens the note under it. There
     * is no hover to keep: a finger is either touching or it is not.
     */
    let panningTouch = false;
    let pinchGap = 0;
    function gapBetween(touches: TouchList): number {
      const [a, b] = [touches[0]!, touches[1]!];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function onTouchStart(event: TouchEvent) {
      if (event.touches.length === 1) {
        panningTouch = true;
        moved = false;
        lastX = event.touches[0]!.clientX;
        lastY = event.touches[0]!.clientY;
        return;
      }
      // A pinch is never a tap, whatever the fingers do next.
      panningTouch = false;
      moved = true;
      if (event.touches.length === 2) pinchGap = gapBetween(event.touches);
    }
    function onTouchMove(event: TouchEvent) {
      // The canvas owns this gesture; without it the page scrolls instead.
      event.preventDefault();
      if (event.touches.length >= 2) {
        const gap = gapBetween(event.touches);
        if (pinchGap > 0 && gap > 0) {
          const rect = canvas!.getBoundingClientRect();
          const [a, b] = [event.touches[0]!, event.touches[1]!];
          zoomAt(
            (a.clientX + b.clientX) / 2 - rect.left,
            (a.clientY + b.clientY) / 2 - rect.top,
            gap / pinchGap,
          );
        }
        pinchGap = gap;
        return;
      }
      if (!panningTouch || event.touches.length !== 1) return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - lastX;
      const dy = touch.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      state.transform.x += dx;
      state.transform.y += dy;
      lastX = touch.clientX;
      lastY = touch.clientY;
      draw();
    }
    function onTouchEnd(event: TouchEvent) {
      const wasTap = panningTouch && !moved && event.touches.length === 0;
      panningTouch = false;
      pinchGap = 0;
      if (!wasTap) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const { gx, gy } = toGraphSpace(touch);
      const hit = hitTest(gx, gy);

      if (hit?.kind === 'note') {
        const url = addressOfNote(hit.id);
        if (url) void navigate(url);
        return;
      }

      // A tap means what a click means. It matters more here: without a
      // pointer there is no hover at all, so holding the group is the ONLY way
      // a touch device ever sees which notes an attribute value gathers.
      const next = hit?.kind === 'value' && hit !== state.pinned ? hit : null;
      if (next === state.pinned) return;
      state.pinned = next;
      rescope();
    }

    const resize = new ResizeObserver(() => {
      const w = parent?.clientWidth ?? width;
      const h = parent?.clientHeight ?? height;
      if (w === width && h === height) return;
      width = w;
      height = h;
      dpr = window.devicePixelRatio || 1;
      sizeCanvas();
      draw();
    });
    if (parent) resize.observe(parent);

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    return () => {
      sim.stop();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      resize.disconnect();
    };
    // The theme dependency re-runs the effect so the canvas repaints with the
    // active token values.
  }, [filtered, navigate, vaultSlug, theme]);

  const hasControls = drawable.length > 0;

  return (
    <div className="graph-page">
      {/* Two lines, and only two: the trail, then the name of the screen.
          Everything that steers the drawing lives over the drawing. */}
      <div className="graph-toolbar">
        <VaultBreadcrumb items={[{ label: t('graph.heading') }]} className="graph-breadcrumb" />
        <h1>{t('graph.heading')}</h1>
      </div>
      <div className="graph-canvas-wrap">
        {failed && <p className="status">{t('errors.unexpected')}</p>}
        {!failed && !filtered && <GraphSkeleton />}
        {filtered?.nodes.length === 0 && <p className="status">{t('graph.empty')}</p>}
        <canvas ref={canvasRef} />
        <div className="graph-overlay">
          {/*
            Both controls are built from what this vault declares. A vault whose
            notes carry no frontmatter offers neither, because a control that
            steers nothing is worse than no control, and then the panel that
            would hold them has nothing to hold either.
          */}
          {hasControls &&
            (controlsOpen ? (
              <section className="graph-panel" aria-label={t('graph.controls')}>
                <header className="graph-panel-head">
                  <h2>{t('graph.attributeNodes')}</h2>
                  <button
                    type="button"
                    className="graph-panel-close"
                    aria-label={t('graph.closeControls')}
                    onClick={() => setControlsOpen(false)}
                  >
                    <CloseIcon />
                  </button>
                </header>
                {/*
                  Whatever THIS vault declares as discrete, and nothing else.
                  The backend still does not interpret content: these were
                  classified by the shape of the value, so a vault whose notes
                  carry no frontmatter offers no switch, and the panel with it
                  never appears.
                */}
                <div className="graph-switches">
                  {drawable.map((attribute) => {
                    const on = drawn.find((each) => each.name === attribute.name);
                    return (
                      <label key={attribute.name} className="graph-switch">
                        <span
                          className="graph-switch-dot"
                          style={{ background: on ? slotColor(on.slot) : 'transparent' }}
                        />
                        <span className="graph-switch-name">{attribute.name}</span>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={on !== undefined}
                          onChange={() => toggleDrawn(attribute.name)}
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            ) : (
              <button
                type="button"
                className="graph-overlay-button"
                aria-label={t('graph.openControls')}
                onClick={() => setControlsOpen(true)}
              >
                <GearIcon />
              </button>
            ))}
        </div>
        {/*
          There used to be a legend here, a second panel repeating the name of
          every attribute beside its colour. It says nothing the switch above
          does not already say: throwing a switch is what gives the attribute
          its colour, and the switch wears that colour while it is on. The one
          thing the legend held that lives nowhere else is the warning that the
          drawing is not the whole vault, and that moved down here, next to the
          other thing said about the drawing as a whole.
        */}
        <div className="graph-footer">
          {truncated && <span>{t('graph.truncated')}</span>}
          <span>{t(touchOnly ? 'graph.hintTouch' : 'graph.hint')}</span>
        </div>
      </div>
    </div>
  );
}
