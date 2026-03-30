# 多言語 Polyglot Cards

AI-powered flashcard app for multi-language learners. Built with React, Netlify Functions, Neon Postgres, and Gemini AI.

---

## Features

- **Custom Blueprints** — Define any set of fields per deck (Japanese, Chinese, Hanja, example sentences, etc.)
- **AI Generation** — Paste a CSV of vocab; Gemini fills in all fields in batches of 10
- **FSRS-5 Algorithm** — State-of-the-art spaced repetition for Learn mode
- **Freestyle Mode** — Casual review, no SRS consequences, configurable pool (all/seen/unseen)
- **Cloze Deletion** — Example sentences with inline fill-in-the-blank using fuzzy matching
- **Fuzzy Matching** — Accepts near-correct answers (CJK-aware; stricter threshold for character languages)
- **Collection View** — Scrollable list, search, filter by SRS state, inline edit/delete
- **Cloud Sync** — All data in Neon Postgres, accessible from any device
- **Netlify Identity** — Built-in auth, no extra setup needed

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, Tailwind CSS |
| State | Zustand + TanStack Query |
| Backend | Netlify Functions (serverless) |
| Database | Neon (Postgres) |
| Auth | Netlify Identity |
| AI | Google Gemini 2.0 Flash |
| SRS | FSRS-5 |

---

## Setup

### 1. Prerequisites

- Node.js 18+
- [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install -g netlify-cli`
- A [Neon](https://neon.tech) account (free tier is fine)
- A [Google AI Studio](https://aistudio.google.com) API key (free)

### 2. Clone & Install

```bash
git clone <your-repo>
cd polyglot-cards
npm install
```

### 3. Database Setup

1. Create a new project on [neon.tech](https://neon.tech)
2. Copy the connection string (looks like `postgresql://user:pass@host/db?sslmode=require`)
3. Open the Neon SQL Editor and paste the contents of `schema.sql` — run it to create all tables

### 4. Netlify Setup

```bash
# Link to a new or existing Netlify site
netlify link
# or
netlify init
```

Go to your **Netlify Dashboard → Site settings → Environment variables** and add:

```
GEMINI_API_KEY    = your-gemini-api-key
DATABASE_URL      = postgresql://your-neon-connection-string
```

### 5. Enable Netlify Identity

In your Netlify Dashboard:
1. Go to **Identity** tab
2. Click **Enable Identity**
3. Under **Registration**, choose Open or Invite-only
4. Under **Git Gateway**, enable if needed

### 6. Local Development

```bash
# Copy env example
cp .env.example .env
# Fill in your keys in .env

# Run with Netlify Dev (handles functions + identity proxy)
netlify dev
```

The app will be at `http://localhost:8888`

### 7. Deploy

```bash
git add .
git commit -m "Initial deploy"
git push
```

Netlify will auto-deploy on push. Or run `netlify deploy --prod`.

---

## Usage Guide

### Creating a Deck

1. Click **New Deck** on the home screen
2. Set a name and target language (e.g. Korean)
3. You'll be taken to the Blueprint page

### Setting Up a Blueprint

The blueprint defines what fields each card has. For example a Korean deck might have:
- **Reading** (text) — Romanisation / pronunciation
- **Japanese** (text) — Japanese translation
- **Chinese** (text) — Chinese (Simplified) equivalent
- **Hanja** (text) — Chinese characters used in Korean
- **Example** (example) — Sentence with `{{word}}` cloze marker

Click **AI Hint** on each field to add a description for the AI.

**Important:** Mark one field as type **Example** if you want cloze sentences. The AI will automatically wrap the target word with `{{word}}` notation.

Click **Save Blueprint** when done.

### Importing Vocabulary

Prepare a CSV with one vocab word per cell — any column layout works. Example:

```
사랑
행복
감사
```

Or multi-column:
```
사랑,행복,감사
아름답다,슬프다,기쁘다
```

Drop the CSV onto the import zone. Gemini processes it in batches of 10 and saves all cards automatically.

### Learning

**Learn Mode** uses FSRS-5:
1. First reviews all cards that are due (overdue SRS cards)
2. Then introduces new cards
3. After each card, rate yourself: Again / Hard / Good / Easy
4. FSRS calculates the optimal next review date

**Freestyle Mode** — no SRS, just practice:
- Choose card pool: All / Seen / Unseen
- Set batch size
- Mark got it / didn't know (no SRS effect)

### Cloze Mode

When enabled and a card has an example sentence, before revealing the card back you'll see the sentence with the target word blanked out. Type the word in the inline input and press Enter or Check. Fuzzy matching accepts ~85%+ character accuracy (90%+ for CJK scripts).

---

## Architecture

```
polyglot-cards/
├── src/
│   ├── pages/
│   │   ├── AuthGate.jsx         # Login screen
│   │   ├── AppShell.jsx         # Sidebar layout
│   │   ├── DeckSelect.jsx       # Deck management
│   │   ├── BlueprintPage.jsx    # Blueprint editor + CSV import
│   │   ├── StudyPage.jsx        # Learn + Freestyle sessions
│   │   ├── CollectionPage.jsx   # Browse/edit cards
│   │   └── SettingsPage.jsx     # App settings
│   ├── hooks/
│   │   └── useAuth.js           # Netlify Identity hook
│   ├── lib/
│   │   ├── api.js               # API client (calls Netlify Functions)
│   │   ├── fsrs.js              # FSRS-5 algorithm
│   │   └── fuzzy.js             # Fuzzy matching + cloze parser
│   └── store/
│       └── appStore.js          # Zustand global state
├── netlify/functions/
│   ├── _db.js                   # Shared DB + auth helpers
│   ├── decks.js                 # Deck CRUD
│   ├── blueprint.js             # Blueprint field CRUD
│   ├── cards.js                 # Card CRUD
│   ├── cards-batch.js           # Batch insert
│   ├── srs.js                   # SRS scheduling + due cards
│   └── generate.js              # Gemini AI generation
└── schema.sql                   # Postgres schema
```

---

## FSRS-5 Notes

The FSRS-5 algorithm uses stability, difficulty, and retrievability to compute optimal review intervals. Ratings map to:

- **Again (1)** — Forgot; card goes back to relearning
- **Hard (2)** — Remembered with effort; short interval
- **Good (3)** — Remembered correctly; standard interval
- **Easy (4)** — Too easy; longer interval

Interval previews are shown on each button before you click.

---

## Cloze Format

In example sentences, the AI marks the target vocab with `{{word}}`:

```
나는 너를 {{사랑}}해.
```

This is stored in the database as-is. The app parses it at display time to show the blank and check the answer. You can also write this manually when editing cards.
