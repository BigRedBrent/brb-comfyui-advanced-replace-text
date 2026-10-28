import { app } from "../../scripts/app.js";

// Page-side part of the Advanced Replace Text node:
// - Shows only the find and replace pairs in use, plus one empty pair at the end. Filling in the last pair adds
//   a new empty one, and when the last two pairs are empty, the last one is hidden again. A pair with a wire
//   connected counts as in use. Each pair has a small gap above it.
// - When you click Run, with "replace_tokens" on, fills in tokens for other nodes' settings, like %KSampler.seed%,
//   in the text and replace boxes typed into this node, the same way ComfyUI's Primitive does. Find boxes are
//   always taken exactly as typed. %date:...% tokens are left for the node to fill in when it runs, so the time
//   is the time of the run.

const NODE_TYPE = "BRBAdvancedReplaceText";

const LOG_PREFIX = "[Advanced Replace Text]";

// How many pairs the node has (PAIRS in __init__.py).
const PAIRS = 100;

// How often to check whether pairs need to be shown or hidden, in milliseconds.
const CHECK_EVERY = 300;

// Height of the gap above each pair.
const PAIR_GAP = 6;

function findWidget(node, name) {
    return (node.widgets || []).find((widget) => widget.name === name) || null;
}

function isTextSetting(widget) {
    // The find boxes aren't included: they're always taken exactly as typed.
    return widget.name === "text" || /^replace_\d+$/.test(widget.name || "");
}

function isWired(node, name) {
    const input = (node.inputs || []).find((item) => item.widget?.name === name || item.name === name);
    return input?.link != null;
}

function pairInUse(node, number) {
    for (const name of [`find_${number}`, `replace_${number}`]) {
        const value = findWidget(node, name)?.value;
        if ((typeof value === "string" && value !== "") || isWired(node, name)) {
            return true;
        }
    }
    return false;
}

function pairsToShow(node) {
    // Every pair up to the last one in use, plus one empty pair.
    let last = 0;
    for (let number = PAIRS; number >= 1; number--) {
        if (pairInUse(node, number)) {
            last = number;
            break;
        }
    }
    return Math.min(PAIRS, last + 1);
}

function addGaps(node) {
    // A small empty space above each pair. It's not a setting, so it's never saved.
    for (let number = 1; number <= PAIRS; number++) {
        const find = findWidget(node, `find_${number}`);
        if (!find || findWidget(node, `gap_${number}`)) {
            continue;
        }
        const gap = {
            type: "gap",
            name: `gap_${number}`,
            value: null,
            serialize: false,
            draw() {},
            shownSize: (width) => [width, PAIR_GAP],
        };
        gap.computeSize = gap.shownSize;
        node.widgets.splice(node.widgets.indexOf(find), 0, gap);
    }
}

function hideWidget(widget) {
    widget.hidden = true;
    widget.options = widget.options || {};
    widget.options.hidden = true;
    widget.computeSize = () => [0, -4];
}

function showWidget(widget) {
    widget.hidden = false;
    widget.options = widget.options || {};
    widget.options.hidden = false;
    if (widget.shownSize) {
        widget.computeSize = widget.shownSize;
    } else {
        delete widget.computeSize;
    }
}

function refreshDisplay(widget) {
    // The newer node display only notices a widget being shown or hidden when a value changes, so the value is
    // changed and put right back.
    if (typeof widget.value === "string") {
        const value = widget.value;
        widget.value = value + "\x00";
        widget.value = value;
    }
}

function updatePairs(node) {
    const shown = pairsToShow(node);
    if (node.shownPairs === shown) {
        return;
    }
    node.shownPairs = shown;
    for (let number = 1; number <= PAIRS; number++) {
        for (const name of [`gap_${number}`, `find_${number}`, `replace_${number}`]) {
            const widget = findWidget(node, name);
            if (!widget) {
                continue;
            }
            if (number <= shown) {
                showWidget(widget);
            } else {
                hideWidget(widget);
            }
        }
    }
    const last = findWidget(node, `replace_${shown}`);
    if (last) {
        refreshDisplay(last);
    }
    const size = node.computeSize?.();
    if (size) {
        node.setSize([node.size[0], size[1]]);
    }
    node.setDirtyCanvas?.(true, true);
}

function allNodes(graph, found = []) {
    // Every node in the workflow, including inside subgraphs, in the same order ComfyUI searches them.
    for (const node of graph?.nodes || graph?._nodes || []) {
        if (node.subgraph) {
            allNodes(node.subgraph, found);
        }
        found.push(node);
    }
    return found;
}

function fillSettings(value) {
    // Works like ComfyUI's own token filling: the node is found by its "Node name for S&R" property, or else
    // by its title, and characters that can't be in file names are changed to "_".
    if (typeof value !== "string" || !value.includes("%")) {
        return value;
    }
    const nodes = allNodes(app.rootGraph ?? app.graph);
    return value.replace(/%([^%]+)%/g, (match, text) => {
        const split = text.split(".");
        if (text.startsWith("date:") || split.length !== 2) {
            // A date, filled in when the node runs (it may contain a dot, like %date:ss.fff%), or something that
            // isn't a token.
            return match;
        }
        let found = nodes.filter((node) => node.properties?.["Node name for S&R"] === split[0]);
        if (!found.length) {
            found = nodes.filter((node) => node.title === split[0]);
        }
        if (!found.length) {
            console.warn(`${LOG_PREFIX} No node named "${split[0]}" for ${match}`);
            return match;
        }
        const widget = (found[0].widgets || []).find((item) => item.name === split[1]);
        if (!widget) {
            console.warn(`${LOG_PREFIX} The node "${split[0]}" has no setting "${split[1]}" for ${match}`);
            return match;
        }
        return String(widget.value ?? "").replaceAll(/[/?<>\\:*|"\x00-\x1F\x7F]/g, "_");
    });
}

app.registerExtension({
    name: "BRB.AdvancedReplaceText",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            for (const widget of this.widgets || []) {
                if (!isTextSetting(widget)) {
                    continue;
                }
                // What's sent with the job. The box itself keeps the tokens, so they're filled in again each run.
                widget.serializeValue = () => {
                    if (findWidget(this, "replace_tokens")?.value === false) {
                        return widget.value;
                    }
                    return fillSettings(widget.value);
                };
            }
            addGaps(this);
            this.shownPairs = null;
            updatePairs(this);
            this.pairCheck = setInterval(() => updatePairs(this), CHECK_EVERY);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            // Show the pairs in use in an opened workflow.
            this.shownPairs = null;
            updatePairs(this);
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            setTimeout(() => updatePairs(this), 0);
            return result;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            clearInterval(this.pairCheck);
            return onRemoved?.apply(this, arguments);
        };
    },
});
