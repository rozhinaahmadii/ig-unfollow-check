# IG Unfollow Check

A lightweight Chrome extension that shows you which accounts you follow on Instagram that don't follow you back, and lets you unfollow them directly from the page. No third-party logins, no shady databases, no external servers. 

*Supported browsers: Chrome, Edge, Arc, Brave*

## Set up (in under 3 mins)

1. **Download the project:** Click the green **Code** button at the top right of this page, select **Download ZIP**, and extract it on your computer.
      
2. **Open Extensions Page:** Open a new tab in Chrome (or Edge/Brave/Arc) and go to `chrome://extensions/`.

3. **Enable Developer Mode:** Flip the **Developer mode** toggle switch in the top-right corner.
   
4. **Load the Extension:** Click the **Load unpacked** button in the top-left corner, and select the extracted folder. Make sure to select the inner folder if your extractor created a double folder layer!
   
5. **Pin & Run:** Click the puzzle piece icon in your browser toolbar, pin **IG Unfollow Check**, and you're ready to use it!

## How it works (The Engineering Part)

When you're logged into instagram.com, your browser already holds a valid session. This extension leverages your active session cookies to safely query Instagram's internal web endpoints—meaning it never asks for your password and your data never leaves your machine.

## Features

- **100% Zero Friction:** Zero typing required. It safely auto-detects your logged-in username directly from the page state.
- **Smart Progress Tracking:** A real-time loading bar built on actual account data.
- **Rate-Limit Safe:** Implements an intentional request-cooldown delay to respect platform safety thresholds.
- 
**The Logic:**
1. **Dynamic Metric Profiling:** Fetches your account data to find your exact follower and following counts.
2. **Synchronized Ingestion:** Fetches both lists (paginated, 50 profiles per batch). 
3. **Progress Mapping:** Calculates a real-time progress bar percentage based dynamically on your total actual metrics.
4. **O(1) Matrix Lookup:** Loads your followers into a JavaScript `Set` for instant lookup time complexity, filters your following list against it, and maps out the non-followers.

## File Structure

```text
ig-unfollow-check/
├── manifest.json   — Extension metadata, cookie permissions, and scoping
├── content.js      — Injected execution engine; handles username detection, API math, and UI panel
├── popup.html      — The dashboard UI window that drops down from the toolbar icon
├── popup.js        — Active tab cookie check, validation states, and event listeners
└── icon.png        — Extension brand asset
