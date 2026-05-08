# CAMANAVA Oil Price - Setup Instructions

## What I changed and why

- Removed `better-sqlite3` (needed Visual Studio C++ to compile - that was your error)
- Replaced with `lowdb` (pure JavaScript, no compiler needed)
- Added seed data so the app works immediately even if scraper fails
- Cleaner folder structure

## Setup Steps

### 1. Replace ALL your old files
Delete everything in `Downloads\camanava oil` folder, then put these new files in their place.

Folder must look exactly like this:
```
camanava oil\
  ├── database.js
  ├── package.json
  ├── README.md
  ├── scraper.js
  ├── server.js
  └── public\
        └── index.html
```

### 2. Open VS Code in the right folder
- File → Open Folder → select `Downloads\camanava oil`
- Open terminal: Ctrl + `

### 3. Install dependencies
Make sure your terminal shows `Downloads\camanava oil>` (NOT inside `public`).

If you're inside public, run:
```
cd ..
```

Then install:
```
npm install
```

This should finish without errors in about 30 seconds.

### 4. Start the server
```
node server.js
```

You should see:
```
[Server] Running on http://localhost:3000
[Cron] Scheduled daily at 9AM Manila time
[Init] Database empty, running initial scrape...
```

### 5. Open browser
Go to: http://localhost:3000

You'll see oil prices displayed. If scraper failed to parse fuelprice.ph, it'll show seed data with the label "Seed data" - that's fine, app still works.

### 6. Stop server
Press Ctrl + C in terminal.

## Updating prices manually

If you want to update the seed prices to current values, edit `scraper.js` lines 10-15 (the SEED_PRICES array). Use the latest from doe.gov.ph.

## Next steps (after this works)

1. Get it working locally first
2. Then we'll fix the scraper to actually pull from fuelprice.ph live
3. Then deploy to Railway.app for free
