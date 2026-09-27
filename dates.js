/* Days and weeks run on Eastern time (Virginia), Sunday to Saturday.
   Alabama is an hour behind, which only matters after 11pm Central. */
const Dates = (() => {
  const TZ = 'America/New_York';
  const DAY = 86400000;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

  // 'YYYY-MM-DD' for a moment in time, in Eastern.
  const dayOf = (ms = Date.now()) => fmt.format(new Date(ms));

  // Date strings are treated as plain calendar days (noon UTC avoids DST edges).
  const parse = s => new Date(`${s}T12:00:00Z`);
  const str = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => str(new Date(parse(s).getTime() + n * DAY));
  const weekday = s => parse(s).getUTCDay(); // 0 = Sunday
  const weekOf = s => addDays(s, -weekday(s));
  const today = () => dayOf();
  const thisWeek = () => weekOf(today());

  const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nice = s => { const d = parse(s); return `${SHORT[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  // Short month names get spelled out; long ones are shortened (Sept, Aug...).
  const GARDEN_MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  // A week belongs to the month its Sunday falls in: Sunday the 1st-7th is week 1.
  const monthWeek = week => {
    const d = parse(week);
    return { month: GARDEN_MONTHS[d.getUTCMonth()], n: Math.ceil(d.getUTCDate() / 7) };
  };
  const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd ...
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  const niceMid = s => { const d = parse(s); return `${SHORT[d.getUTCDay()]}, ${GARDEN_MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}`; };
  const niceLong = s => { const d = parse(s); return `${SHORT[d.getUTCDay()]}, ${FULL_MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}`; };
  const monthDay = s => { const d = parse(s); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };

  return { dayOf, addDays, weekday, weekOf, today, thisWeek, nice, niceMid, niceLong, monthDay, monthWeek, SHORT };
})();
