import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayKey, inSeason } from '../src/season';

const on = (month: number, day: number): Date => new Date(2026, month - 1, day, 12);

test('with no dates it is always in season', () => {
  assert.equal(inSeason(undefined, undefined, on(7, 4)), true);
});

test('a season inside one year includes both ends', () => {
  assert.equal(inSeason('12-01', '12-26', on(11, 30)), false);
  assert.equal(inSeason('12-01', '12-26', on(12, 1)), true);
  assert.equal(inSeason('12-01', '12-26', on(12, 26)), true);
  assert.equal(inSeason('12-01', '12-26', on(12, 27)), false);
});

test('a season can run over New Year', () => {
  assert.equal(inSeason('12-01', '01-06', on(12, 15)), true);
  assert.equal(inSeason('12-01', '01-06', on(1, 6)), true);
  assert.equal(inSeason('12-01', '01-06', on(1, 7)), false);
  assert.equal(inSeason('12-01', '01-06', on(6, 1)), false);
});

test('one missing end means the start or the end of the year', () => {
  assert.equal(inSeason('11-15', undefined, on(12, 31)), true);
  assert.equal(inSeason('11-15', undefined, on(11, 14)), false);
  assert.equal(inSeason(undefined, '01-06', on(1, 3)), true);
  assert.equal(inSeason(undefined, '01-06', on(2, 1)), false);
});

test('dates that do not exist are ignored', () => {
  assert.equal(dayKey('02-30'), null);
  assert.equal(dayKey('13-01'), null);
  assert.equal(dayKey('december'), null);
  assert.equal(dayKey('2-9'), 209);
  assert.equal(inSeason('99-99', undefined, on(7, 4)), true);
});
