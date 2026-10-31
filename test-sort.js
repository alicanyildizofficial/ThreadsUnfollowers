var users = Array.from({length: 10000}, (_, i) => ({username: 'user' + Math.random().toString(36).substring(7)}));

console.time('localeCompare');
var sorted1 = users.slice().sort(function(a, b) { return a.username.localeCompare(b.username, 'tr'); });
console.timeEnd('localeCompare');

var collator = new Intl.Collator('tr');
console.time('Intl.Collator');
var sorted2 = users.slice().sort(function(a, b) { return collator.compare(a.username, b.username); });
console.timeEnd('Intl.Collator');
