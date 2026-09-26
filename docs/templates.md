# Templates

Every scene has `template`, `duration` (seconds, up to 60) and an optional `theme` (`light`, `dark`, `brand`, or a custom theme declared under `themes`). Text fields marked *markup* accept `*accent*` words. Fields typed "lines" take 1–4 strings; each is one headline line that never wraps (the runtime shrinks the block if a line is too long for its column).

## Short-form (daily reels)

### hook · default theme `dark`

| Field | Type | |
|---|---|---|
| `text` | string, markup | The line. Words pop in one by one; an accent phrase pops as one. Wraps freely. |
| `kicker` | string, markup, optional | Small label above |

### tip · `light`

| Field | Type | |
|---|---|---|
| `kicker` | string, markup, optional | e.g. "Tip 4 of 30" |
| `headline` | lines | |
| `body` | string, markup, optional | One or two sentences |
| `note` | string, markup, optional | Small text under a rule |

### myth-fact · `light`

| Field | Type | |
|---|---|---|
| `kicker` | string, markup, optional | |
| `myth` | string, markup | Gets crossed out |
| `fact` | string, markup | Lands beside (landscape) or under it |
| `mythLabel`, `factLabel` | string | Tags; default "Myth" / "Fact" |

### stat · `brand`

| Field | Type | |
|---|---|---|
| `kicker` | string, markup, optional | |
| `value` | string | `"57%"`, `"₹3,40,000"`, `"3x"`, `"$1.2M"`. The digits count up (Indian grouping is kept if the value uses it); anything around them stays as written. |
| `label` | string, markup | Under the rule |
| `source` | string, markup, optional | Small print |

### quote · `light`

| Field | Type | |
|---|---|---|
| `text` | string, markup | Revealed a few words at a time; size follows length |
| `author` | string | |
| `role` | string, optional | |
| `image` | path, optional | Round avatar |

### list · `light`

| Field | Type | |
|---|---|---|
| `title` | lines | Beside the list (landscape) or above it (portrait) |
| `items` | 2–6 strings, markup | Arrive one at a time |
| `numbered` | boolean | Default `true`; `false` uses dots |

### versus · `light`

| Field | Type | |
|---|---|---|
| `title` | string, markup, optional | |
| `left` | `{ label, items: 1–5 strings }` | The old way, with × marks |
| `right` | `{ label, items: 1–5 strings }` | The better way, with ✓ marks |

### media · `dark`

| Field | Type | |
|---|---|---|
| `image` | path | Fills the frame with a slow push-in |
| `headline` | lines | Over a shade at the bottom |
| `caption` | string, markup, optional | |

### custom · `light`

| Field | Type | |
|---|---|---|
| `code` | path | A JS module: `export default function (root, api) { …; return timeline }`. See [custom-scenes.md](custom-scenes.md). |
| `css` | path, optional | Styles, scoped under a class the module adds to `root` |
| `props` | object | Passed to the module untouched |

## Long-form (launch films, ads)

### statement · `dark`

| Field | Type | |
|---|---|---|
| `lines` | lines | Headline. A fully accented line is set as an italic sub-line. |
| `card` | `{ label, value, stamp? }` | Optional document card beside the headline. `stamp` slams onto it. |

### strike · `light`

| Field | Type | |
|---|---|---|
| `before` | string, markup | The line that gets crossed out |
| `after` | string, markup | The line that replaces it. Accent words pop. |

### logo-reveal · `brand`

| Field | Type | |
|---|---|---|
| `tagline` | string, markup, optional | Under the wordmark. The brand `name`, `logo` and `logoMotion` are used automatically. |

### chat · `light`

| Field | Type | |
|---|---|---|
| `headline` | lines | Left (landscape) or top (portrait) |
| `caption` | string, markup, optional | |
| `assistant` | string | Name in the chat header (default `Assistant`) |
| `question` | string | Typed out letter by letter |
| `answer` | string, markup | Appears after a typing indicator |
| `results` | up to 4 `{ name, tags?: string[≤3], score?: 0–100 }` | Result rows. Scores count up as percentages. |

### counter · `dark`

| Field | Type | |
|---|---|---|
| `value` | integer | Counts up from 0 (formatted with grouping) |
| `prefix`, `suffix` | string | e.g. `"$"`, `"+"` in the accent colour |
| `title` | string, markup | |
| `subtitle` | string, markup, optional | |

### doc-scan · `light`

| Field | Type | |
|---|---|---|
| `docLabel` | string | Small caps label, e.g. a file name |
| `docTitle` | string | |
| `flags` | 1–4 `{ text, tone: warn \| ok \| bad }` | Findings that pop out beside the document |
| `headline` | lines | |
| `caption` | string, markup, optional | |

### steps · `brand`

| Field | Type | |
|---|---|---|
| `headline` | lines | |
| `caption` | string, markup, optional | |
| `steps` | 2–5 strings, markup | Numbered steps that light up in order |

### end-card · `light`

| Field | Type | |
|---|---|---|
| `tagline` | string, markup | |
| `cta` | string, markup | Pill button text |
| `fineprint` | string, markup, optional | |
