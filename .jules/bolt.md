## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.
## 2026-10-15 - Fast Array Sorting with Intl.Collator
**Learning:** Using `String.prototype.localeCompare` inside an `Array.prototype.sort()` callback is slow for large datasets because it recreates the collation object on every iteration, causing noticeable UI jank and main thread blocking, particularly for functions called synchronously on events like keystrokes.
**Action:** Use a cached `new Intl.Collator()` instance outside of the loop and call its `.compare()` method for sorting arrays containing strings to greatly improve performance.
