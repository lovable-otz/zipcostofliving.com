/* calculator.js — zipcostofliving.com
 * Tools: colCompare · rentAfford · proratedRent · rentSplit · rentVsBuy · movingCost · budget
 *
 * DATA — assets/col-data.js (window.COLDATA), parsed from saved sources on 2026-09-16:
 *   · Price levels: U.S. Bureau of Economic Analysis, Regional Price Parities (RPP) 2024, for 50 states + DC and
 *     every metropolitan statistical area BEA publishes. RPP = the price level of a place as a % of the U.S. average
 *     (100). BEA publishes all items plus goods, housing, utilities and other services.
 *   · Truck fuel price (moving tool default): EIA Gasoline and Diesel Fuel Update, U.S. regular, latest week.
 * RULES OF THUMB the user can change, labelled on the page: rent as a share of income, the landlord income
 * multiple, the 50/30/20 split, and every rent-vs-buy assumption.
 */
(function (root, factory) {
  const C = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = C; else root.CALCS = C;
})(typeof self !== 'undefined' ? self : this, function (root) {
  let DATA = root && root.COLDATA;
  const r2 = n => Math.round(n * 100) / 100;

  const placeOptions = () => {
    if (!DATA) return [];
    const all = Object.entries(DATA.rpp.places);
    const st = all.filter(([, p]) => p.t === 'state').sort((a, b) => a[1].n.localeCompare(b[1].n));
    const mt = all.filter(([, p]) => p.t === 'metro').sort((a, b) => a[1].n.localeCompare(b[1].n));
    return [...st.map(([id, p]) => ({ value: id, label: p.n })), ...mt.map(([id, p]) => ({ value: id, label: `${p.n} (metro)` }))];
  };

  const colCompare = {
    title: 'Cost of living calculator',
    inputs: [
      { id: 'salary', label: 'Your current salary', type: 'number', prefix: '$', default: 60000, min: 0 },
      { id: 'from', label: 'Where you live now', type: 'select', default: 'st-01000', options: placeOptions },
      { id: 'to', label: 'Where you are thinking of moving', type: 'select', default: 'st-48000', options: placeOptions },
    ],
    compute(v, fmt) {
      if (!DATA) return { warnings: ['Price data did not load.'] };
      const A = DATA.rpp.places[v.from], B = DATA.rpp.places[v.to];
      if (!A || !B) return { warnings: ['Choose two places.'] };
      const eq = (v.salary || 0) * B.a / A.a;
      const pct = (B.a / A.a - 1) * 100;
      const part = (k) => r2((B[k] / A[k] - 1) * 100);
      const sign = x => `${x > 0 ? '+' : ''}${x}%`;
      return {
        raw: { equivalent: r2(eq), pct: r2(pct), housing: part('h') },
        summary: [
          { label: `Salary with the same buying power in ${B.n}`, value: fmt.money0(eq), strong: true },
          { label: 'Overall price difference', value: sign(r2(pct)) },
          { label: 'Housing (rents) difference', value: sign(part('h')) },
        ],
        rows: [
          { label: 'All items', value: `${A.a} → ${B.a} (${sign(r2(pct))})` },
          { label: 'Housing', value: `${A.h} → ${B.h} (${sign(part('h'))})` },
          { label: 'Goods', value: `${A.g} → ${B.g} (${sign(part('g'))})` },
          { label: 'Utilities', value: `${A.u} → ${B.u} (${sign(part('u'))})` },
          { label: 'Other services', value: `${A.o} → ${B.o} (${sign(part('o'))})` },
        ],
        notes: [`Price levels are BEA Regional Price Parities for ${DATA.rpp.year} (U.S. average = 100). They compare average prices across the whole state or metro — your neighborhood, rent and household can differ. Taxes are not included.`],
      };
    },
  };

  const rentAfford = {
    title: 'Rent affordability calculator',
    inputs: [
      { id: 'income', label: 'Yearly gross income (all tenants on the lease)', type: 'number', prefix: '$', default: 72000, min: 0 },
      { id: 'pct', label: 'Share of gross monthly income you want on rent', type: 'number', suffix: '%', default: 30, min: 1, max: 80, step: 0.5, help: '30% is a widely used guideline, not a rule. Change it to your own comfort level.' },
      { id: 'mult', label: 'Landlord income requirement (income ÷ monthly rent must be at least)', type: 'number', suffix: '× rent', default: 40, min: 1, max: 100, step: 0.5, help: 'Many landlords ask for yearly income of 40× the monthly rent (some use 3× monthly). Ask the building for its number.' },
    ],
    compute(v, fmt) {
      const byPct = (v.income || 0) / 12 * (v.pct || 0) / 100;
      const byMult = (v.income || 0) / (v.mult || 1);
      return {
        raw: { byPct: r2(byPct), byMult: r2(byMult), max: r2(Math.min(byPct, byMult)) },
        summary: [
          { label: 'Rent that meets both tests', value: fmt.money0(Math.min(byPct, byMult)), strong: true },
          { label: `At ${v.pct}% of income`, value: fmt.money0(byPct) },
          { label: `Landlord ${v.mult}× test`, value: fmt.money0(byMult) },
        ],
        notes: ['Uses gross (pre-tax) income, which is what most landlords check. Utilities, renter’s insurance and parking come on top.'],
      };
    },
  };

  const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  const proratedRent = {
    title: 'Prorated rent calculator',
    inputs: [
      { id: 'rent', label: 'Monthly rent', type: 'number', prefix: '$', default: 1500, min: 0 },
      { id: 'mode', label: 'Are you moving in or out?', type: 'radio', default: 'in', options: [{ value: 'in', label: 'Moving in' }, { value: 'out', label: 'Moving out' }] },
      { id: 'date', label: 'Move-in date / last day you pay for', type: 'date', default: '2026-09-16' },
      { id: 'method', label: 'How your lease prorates', type: 'select', default: 'month', options: [
        { value: 'month', label: 'Actual days in that month' }, { value: 'year', label: 'Daily rate from a 365-day year' }, { value: 'banker', label: '30-day month' }] },
    ],
    compute(v, fmt) {
      const d = parseDate(v.date);
      if (!d) return { warnings: ['Enter a date.'] };
      const dim = daysIn(d.y, d.m);
      const days = v.mode === 'in' ? dim - d.d + 1 : d.d;
      const daily = v.method === 'year' ? (v.rent || 0) * 12 / 365 : (v.rent || 0) / (v.method === 'banker' ? 30 : dim);
      const amount = daily * days;
      return {
        raw: { days, amount: r2(amount) },
        summary: [{ label: 'Prorated rent', value: fmt.money(amount), strong: true }, { label: 'Days charged', value: String(days) }, { label: 'Daily rate', value: fmt.money(daily) }],
        notes: [`${v.mode === 'in' ? 'Counts the move-in day through the last day of the month' : 'Counts the 1st of the month through the date you entered'}. Your lease decides the method — check it before you pay.`],
      };
    },
  };

  const rentSplit = {
    title: 'Rent split calculator',
    inputs: [
      { id: 'rent', label: 'Total monthly rent', type: 'number', prefix: '$', default: 3000, min: 0 },
      { id: 'method', label: 'Split by', type: 'radio', default: 'income', options: [{ value: 'equal', label: 'Equal shares' }, { value: 'income', label: 'Income' }, { value: 'room', label: 'Bedroom size' }] },
      { id: 'common', label: 'Share of rent for shared space, split equally', type: 'number', suffix: '%', default: 50, min: 0, max: 100, showIf: s => s.method === 'room' },
      { id: 'people', label: 'Roommates', type: 'repeater', addLabel: '+ Add roommate', default: [{ name: 'Alex', income: 60000, size: 200 }, { name: 'Sam', income: 40000, size: 100 }],
        columns: [{ id: 'name', label: 'Name' }, { id: 'income', label: 'Yearly income', type: 'number' }, { id: 'size', label: 'Room size (sq ft)', type: 'number' }] },
    ],
    compute(v, fmt) {
      const ppl = (v.people || []).filter(p => p && (p.name || p.income || p.size));
      if (!ppl.length) return { warnings: ['Add at least one roommate.'] };
      const n = ppl.length, rent = v.rent || 0;
      let shares;
      if (v.method === 'income') {
        const tot = ppl.reduce((s, p) => s + (p.income || 0), 0);
        if (!tot) return { warnings: ['Enter each roommate’s income.'] };
        shares = ppl.map(p => rent * (p.income || 0) / tot);
      } else if (v.method === 'room') {
        const tot = ppl.reduce((s, p) => s + (p.size || 0), 0);
        if (!tot) return { warnings: ['Enter each room’s size.'] };
        const common = rent * (v.common || 0) / 100;
        shares = ppl.map(p => common / n + (rent - common) * (p.size || 0) / tot);
      } else shares = ppl.map(() => rent / n);
      const raw = {};
      shares.forEach((s, k) => { raw[`share${k + 1}`] = r2(s); });
      return {
        raw,
        summary: ppl.map((p, k) => ({ label: p.name || `Roommate ${k + 1}`, value: `${fmt.money(shares[k])} / month`, strong: k === 0 })),
        rows: ppl.map((p, k) => ({ label: p.name || `Roommate ${k + 1}`, value: `${fmt.pct(rent ? shares[k] / rent * 100 : 0)} of the rent` })),
        notes: ['Shares are rounded to the cent; agree who covers the leftover cent, utilities and the deposit in writing.'],
      };
    },
  };

  function rentVsBuyAt(v, years) {
    const price = v.price || 0, down = price * (v.downPct || 0) / 100, loan = price - down;
    const r = (v.rate || 0) / 1200, n = (v.term || 30) * 12;
    const pmt = r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
    let bal = loan, renter = down + price * (v.closingPct || 0) / 100, buyer = 0;
    const g = (v.invest || 0) / 1200;
    for (let y = 0; y < years; y++) {
      const value = price * Math.pow(1 + (v.appreciation || 0) / 100, y);
      const own = pmt + value * (v.taxPct || 0) / 1200 + (v.insurance || 0) / 12 + value * (v.maintPct || 0) / 1200 + (v.hoa || 0);
      const rentM = (v.rent || 0) * Math.pow(1 + (v.rentIncrease || 0) / 100, y);
      for (let m = 0; m < 12; m++) {
        if (bal > 0) bal = Math.max(0, bal + bal * r - pmt);
        renter *= 1 + g; buyer *= 1 + g;
        const diff = own - rentM;
        if (diff > 0) renter += diff; else buyer -= diff;
      }
    }
    const proceeds = price * Math.pow(1 + (v.appreciation || 0) / 100, years) * (1 - (v.sellingPct || 0) / 100) - bal;
    return { pmt, buyer: proceeds + buyer, renter, advantage: proceeds + buyer - renter };
  }

  const rentVsBuy = {
    title: 'Rent vs buy calculator',
    inputs: [
      { id: 'years', label: 'Years you expect to stay', type: 'number', default: 7, min: 1, max: 30 },
      { id: 'rent', label: 'Monthly rent for a similar home', type: 'number', prefix: '$', default: 2200, min: 0 },
      { id: 'price', label: 'Home price', type: 'number', prefix: '$', default: 400000, min: 0 },
      { id: 'downPct', label: 'Down payment', type: 'number', suffix: '%', default: 20, min: 0, max: 100 },
      { id: 'rate', label: 'Mortgage rate', type: 'number', suffix: '%', default: 6.5, min: 0, max: 20, step: 0.01 },
      { id: 'term', label: 'Mortgage term (years)', type: 'select', default: '30', options: [{ value: '30', label: '30 years' }, { value: '20', label: '20 years' }, { value: '15', label: '15 years' }] },
      { id: 'taxPct', label: 'Property tax (share of home value per year)', type: 'number', suffix: '%', default: 1.1, min: 0, max: 5, step: 0.01 },
      { id: 'insurance', label: 'Homeowners insurance per year', type: 'number', prefix: '$', default: 1800, min: 0 },
      { id: 'maintPct', label: 'Maintenance per year (share of home value)', type: 'number', suffix: '%', default: 1, min: 0, max: 5, step: 0.1 },
      { id: 'hoa', label: 'HOA dues per month', type: 'number', prefix: '$', default: 0, min: 0 },
      { id: 'closingPct', label: 'Closing costs when buying', type: 'number', suffix: '% of price', default: 3, min: 0, max: 10, step: 0.1 },
      { id: 'sellingPct', label: 'Selling costs when you leave', type: 'number', suffix: '% of price', default: 6, min: 0, max: 12, step: 0.1 },
      { id: 'appreciation', label: 'Home price growth per year (your assumption)', type: 'number', suffix: '%', default: 3, min: -10, max: 15, step: 0.1 },
      { id: 'rentIncrease', label: 'Rent increase per year (your assumption)', type: 'number', suffix: '%', default: 3, min: -10, max: 15, step: 0.1 },
      { id: 'invest', label: 'Return on money you invest instead (your assumption)', type: 'number', suffix: '%', default: 5, min: 0, max: 15, step: 0.1 },
    ],
    compute(v, fmt) {
      v = { ...v, term: Number(v.term) };
      const res = rentVsBuyAt(v, v.years || 1);
      let breakeven = null;
      for (let y = 1; y <= 30; y++) if (rentVsBuyAt(v, y).advantage >= 0) { breakeven = y; break; }
      const buyWins = res.advantage >= 0;
      return {
        raw: { pmt: r2(res.pmt), buyer: r2(res.buyer), renter: r2(res.renter), advantage: r2(res.advantage), breakeven },
        summary: [
          { label: buyWins ? `Buying leaves you ahead after ${v.years} years by` : `Renting leaves you ahead after ${v.years} years by`, value: fmt.money0(Math.abs(res.advantage)), strong: true },
          { label: 'Buying pays off after', value: breakeven ? `${breakeven} year${breakeven > 1 ? 's' : ''}` : 'more than 30 years' },
          { label: 'Mortgage payment (principal and interest)', value: fmt.money(res.pmt) },
        ],
        rows: [{ label: 'Buyer’s wealth at the end (sale proceeds + investments)', value: fmt.money0(res.buyer) }, { label: 'Renter’s wealth at the end (invested down payment, closing costs and savings)', value: fmt.money0(res.renter) }],
        notes: ['Each month, whoever spends less invests the difference at your return rate. Income taxes, PMI and moving costs are not included. Home prices and returns are assumptions you set, not forecasts.'],
      };
    },
  };

  const movingCost = {
    title: 'Moving cost calculator',
    inputs: [
      { id: 'mode', label: 'How are you moving?', type: 'radio', default: 'diy', options: [{ value: 'diy', label: 'Rent a truck' }, { value: 'movers', label: 'Hire movers' }] },
      { id: 'miles', label: 'Distance', type: 'number', suffix: 'miles', default: 500, min: 0 },
      { id: 'truckDay', label: 'Truck rental per day (from your quote)', type: 'number', prefix: '$', default: 40, min: 0, showIf: s => s.mode !== 'movers' },
      { id: 'days', label: 'Rental days', type: 'number', default: 3, min: 0, showIf: s => s.mode !== 'movers' },
      { id: 'perMile', label: 'Mileage fee per mile (from your quote)', type: 'number', prefix: '$', default: 0.99, min: 0, step: 0.01, showIf: s => s.mode !== 'movers' },
      { id: 'truckMpg', label: 'Truck fuel economy (ask the rental company)', type: 'number', suffix: 'MPG', default: 10, min: 1, step: 0.1, showIf: s => s.mode !== 'movers' },
      { id: 'fuel', label: 'Fuel price (blank = EIA U.S. weekly average)', type: 'number', prefix: '$', default: null, min: 0, step: 0.001, showIf: s => s.mode !== 'movers' },
      { id: 'helpers', label: 'Paid helpers (total)', type: 'number', prefix: '$', default: 200, min: 0, showIf: s => s.mode !== 'movers' },
      { id: 'quote', label: 'Movers’ quote', type: 'number', prefix: '$', default: 2800, min: 0, showIf: s => s.mode === 'movers' },
      { id: 'tipPct', label: 'Tip for the crew', type: 'number', suffix: '%', default: 10, min: 0, max: 30, showIf: s => s.mode === 'movers' },
      { id: 'supplies', label: 'Boxes and packing supplies', type: 'number', prefix: '$', default: 150, min: 0 },
      { id: 'lodging', label: 'Hotel on the way (total)', type: 'number', prefix: '$', default: 120, min: 0 },
      { id: 'mealDays', label: 'Travel days', type: 'number', default: 3, min: 0 },
      { id: 'mealRate', label: 'Food per travel day', type: 'number', prefix: '$', default: 50, min: 0 },
      { id: 'deposit', label: 'Security deposit at the new place', type: 'number', prefix: '$', default: 1500, min: 0 },
      { id: 'firstRent', label: 'First month’s rent due at move-in', type: 'number', prefix: '$', default: 1500, min: 0 },
      { id: 'other', label: 'Anything else (utility deposits, pet fees, storage)', type: 'number', prefix: '$', default: 0, min: 0 },
    ],
    compute(v, fmt) {
      const rows = [];
      let move = 0, fuelCost = 0;
      if (v.mode === 'movers') {
        const tip = (v.quote || 0) * (v.tipPct || 0) / 100;
        move = (v.quote || 0) + tip;
        rows.push({ label: 'Movers’ quote', value: fmt.money(v.quote || 0) }, { label: 'Tip', value: fmt.money(tip) });
      } else {
        const price = v.fuel || (DATA ? DATA.gas.price : 0);
        fuelCost = (v.miles || 0) / (v.truckMpg || 1) * price;
        const truck = (v.truckDay || 0) * (v.days || 0) + (v.perMile || 0) * (v.miles || 0);
        move = truck + fuelCost + (v.helpers || 0);
        rows.push({ label: 'Truck rental and mileage', value: fmt.money(truck) }, { label: `Fuel (${fmt.money(price)}/gal)`, value: fmt.money(fuelCost) }, { label: 'Helpers', value: fmt.money(v.helpers || 0) });
      }
      const travel = (v.lodging || 0) + (v.mealDays || 0) * (v.mealRate || 0);
      const setup = (v.deposit || 0) + (v.firstRent || 0) + (v.other || 0);
      const total = move + (v.supplies || 0) + travel + setup;
      rows.push({ label: 'Packing supplies', value: fmt.money(v.supplies || 0) }, { label: 'Hotel and food', value: fmt.money(travel) }, { label: 'Deposit, first rent and other', value: fmt.money(setup) }, { label: 'Total cash needed', value: fmt.money(total), total: true });
      return {
        raw: { fuel: r2(fuelCost), move: r2(move), total: r2(total) },
        summary: [{ label: 'Total cash you need for the move', value: fmt.money0(total), strong: true }, { label: v.mode === 'movers' ? 'Movers incl. tip' : 'Truck, fuel and helpers', value: fmt.money0(move) }, { label: 'New-home costs', value: fmt.money0(setup) }],
        rows,
        notes: [v.mode === 'movers' ? 'Get at least two written quotes; interstate movers must give you a written estimate.' : (DATA && !v.fuel ? `Fuel default: EIA U.S. regular gasoline, week of ${DATA.gas.week}. Many large trucks use more fuel than you expect — ask for the truck’s MPG.` : 'Using your fuel price.')],
      };
    },
  };

  const budget = {
    title: 'Budget calculator (50/30/20)',
    inputs: [
      { id: 'income', label: 'Monthly take-home pay', type: 'number', prefix: '$', default: 5000, min: 0 },
      { id: 'needs', label: 'Needs (rent, utilities, groceries, minimum debt payments)', type: 'number', suffix: '%', default: 50, min: 0, max: 100 },
      { id: 'wants', label: 'Wants (eating out, subscriptions, travel)', type: 'number', suffix: '%', default: 30, min: 0, max: 100 },
      { id: 'save', label: 'Savings and extra debt payments', type: 'number', suffix: '%', default: 20, min: 0, max: 100 },
    ],
    compute(v, fmt) {
      const inc = v.income || 0, sum = (v.needs || 0) + (v.wants || 0) + (v.save || 0);
      const n = inc * (v.needs || 0) / 100, w = inc * (v.wants || 0) / 100, s = inc * (v.save || 0) / 100;
      return {
        raw: { needs: r2(n), wants: r2(w), save: r2(s) },
        warnings: Math.abs(sum - 100) > 0.001 ? [`Your percentages add up to ${sum}%, not 100%.`] : [],
        summary: [{ label: 'Needs', value: fmt.money0(n), strong: true }, { label: 'Wants', value: fmt.money0(w), strong: true }, { label: 'Savings', value: fmt.money0(s), strong: true }],
        rows: [{ label: 'Needs per week', value: fmt.money(n * 12 / 52) }, { label: 'Wants per week', value: fmt.money(w * 12 / 52) }, { label: 'Savings per year', value: fmt.money0(s * 12) }],
        notes: ['50/30/20 is a starting split, not a rule — in a high-rent city, needs often take more than half.'],
      };
    },
  };

  const fixture = { rpp: { year: '2024', places: {
    'st-01000': { n: 'Alabama', t: 'state', a: 88.823, g: 96.399, h: 61.785, u: 84.643, o: 96.711 },
    'm-99999': { n: 'Metro X', t: 'metro', a: 110.0, g: 100, h: 150.0, u: 100, o: 100 } } },
    gas: { price: 4.319, week: '09/14/26' } };

  return {
    colCompare, rentAfford, proratedRent, rentSplit, rentVsBuy, movingCost, budget,
    __setData: d => { DATA = d; },
    __pure: { rentVsBuyAt },
    // Expected values: build/tests/col_expected.py
    __testData: fixture,
    __tests: [
      { calc: 'colCompare', name: '$60,000 in Alabama = $74,305 in a place priced at 110', input: { salary: 60000, from: 'st-01000', to: 'm-99999' }, expect: { equivalent: 74305.08, pct: 23.84, housing: 142.78 } },
      { calc: 'rentAfford', name: '$90,000 at 25% and 40× → $1,875 (lower of the two)', input: { income: 90000, pct: 25, mult: 40 }, expect: { byPct: 1875, byMult: 2250, max: 1875 } },
      { calc: 'proratedRent', name: 'move in Sept 16 2026: 15 days → $750', input: { rent: 1500, mode: 'in', date: '2026-09-16', method: 'month' }, expect: { days: 15, amount: 750 } },
      { calc: 'proratedRent', name: 'same with a 365-day daily rate → $739.73', input: { rent: 1500, mode: 'in', date: '2026-09-16', method: 'year' }, expect: { amount: 739.73 } },
      { calc: 'proratedRent', name: 'leap February 2028, move in the 10th → 20/29 days', input: { rent: 1500, mode: 'in', date: '2028-02-10', method: 'month' }, expect: { days: 20, amount: 1034.48 } },
      { calc: 'proratedRent', name: 'move out Oct 10 2026 → 10/31 days', input: { rent: 1500, mode: 'out', date: '2026-10-10', method: 'month' }, expect: { days: 10, amount: 483.87 } },
      { calc: 'rentSplit', name: 'by income 60k/40k of $3,000', input: { rent: 3000, method: 'income' }, expect: { share1: 1800, share2: 1200 } },
      { calc: 'rentSplit', name: 'by room 200/100 sq ft, 50% shared', input: { rent: 3000, method: 'room', common: 50 }, expect: { share1: 1750, share2: 1250 } },
      { calc: 'rentVsBuy', name: '$400k home vs $2,200 rent over 7 years → renting ahead $11,567; buying pays off in year 9', input: {}, expect: { pmt: 2022.62, buyer: 173100.59, renter: 184667.94, advantage: -11567.35, breakeven: 9 } },
      { calc: 'movingCost', name: 'truck move 500 mi → $4,450.95', input: { mode: 'diy', fuel: null }, expect: { fuel: 215.95, total: 4450.95 } },
      { calc: 'movingCost', name: 'movers $2,800 + 10% tip → $6,500', input: { mode: 'movers' }, expect: { total: 6500 } },
      { calc: 'budget', name: '$5,000 → 2,500 / 1,500 / 1,000', input: {}, expect: { needs: 2500, wants: 1500, save: 1000 } },
    ],
  };
});
