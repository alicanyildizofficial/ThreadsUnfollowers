## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.
## 2026-10-21 - Intl.Collator for Sorting Performance
**Learning:** Using `String.prototype.localeCompare` inside a `.sort()` callback on a large array is significantly slower than using a cached `Intl.Collator` instance. In `threads-unfollowers.js`, this was causing a bottleneck when sorting the user list on every input search keystroke.
**Action:** When sorting large arrays with locale-specific rules, always instantiate `new Intl.Collator` once outside the loop and use its `compare` method.
