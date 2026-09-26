# Templates

Every scene has `template`, `duration` (seconds, up to 60) and an optional `theme` (`light`, `dark`, `brand`). Text fields marked *markup* accept `*accent*` words.

## statement · default theme `dark`

| Field | Type | |
|---|---|---|
| `lines` | 1–4 strings, markup | Headline lines. A fully accented line is set as an italic sub-line. |
| `card` | `{ label, value, stamp? }` | Optional document card beside the headline. `stamp` slams onto it. |

## strike · `light`

| Field | Type | |
|---|---|---|
| `before` | string, markup | The line that gets crossed out |
| `after` | string, markup | The line that replaces it. Accent words pop. |

## logo-reveal · `brand`

| Field | Type | |
|---|---|---|
| `tagline` | string, markup, optional | Under the wordmark. The brand `name` and `logo` are used automatically. |

## chat · `light`

| Field | Type | |
|---|---|---|
| `headline` | 1–4 strings, markup | Left (landscape) or top (portrait) |
| `caption` | string, markup, optional | |
| `assistant` | string | Name in the chat header (default `Assistant`) |
| `question` | string | Typed out letter by letter |
| `answer` | string, markup | Appears after a typing indicator |
| `results` | up to 4 `{ name, tags?: string[≤3], score?: 0–100 }` | Result rows. Scores count up as percentages. |

## counter · `dark`

| Field | Type | |
|---|---|---|
| `value` | integer | Counts up from 0 (formatted with grouping) |
| `prefix`, `suffix` | string | e.g. `"$"`, `"+"` in the accent colour |
| `title` | string, markup | |
| `subtitle` | string, markup, optional | |

## doc-scan · `light`

| Field | Type | |
|---|---|---|
| `docLabel` | string | Small caps label, e.g. a file name |
| `docTitle` | string | |
| `flags` | 1–4 `{ text, tone: warn \| ok \| bad }` | Findings that pop out beside the document |
| `headline` | 1–4 strings, markup | |
| `caption` | string, markup, optional | |

## steps · `brand`

| Field | Type | |
|---|---|---|
| `headline` | 1–4 strings, markup | |
| `caption` | string, markup, optional | |
| `steps` | 2–5 strings, markup | Numbered steps that light up in order |

## end-card · `light`

| Field | Type | |
|---|---|---|
| `tagline` | string, markup | |
| `cta` | string, markup | Pill button text |
| `fineprint` | string, markup, optional | |
