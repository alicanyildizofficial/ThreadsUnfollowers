## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-22 - Avoid String.prototype.localeCompare inside sort loops
**Learning:** Using `String.prototype.localeCompare` inside `Array.prototype.sort()` callbacks creates significant synchronous main-thread blocking when rendering large, dynamic datasets in JavaScript. The engine has to look up and instatiate locale rules for every comparison.
**Action:** Always cache a new `Intl.Collator(locale)` instance and use `collator.compare(a, b)` inside the sorting callback to avoid re-initializing locale rules repeatedly.
