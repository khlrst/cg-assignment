import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getWallet } from '../src/wallets';

const seedPhrase: string = 'test test test test test test test test test test test junk';

describe('getWallet', () => {
  it('is deterministic', () => {
    const wallet1 = getWallet(seedPhrase, 0);
    const wallet2 = getWallet(seedPhrase, 0);

    assert.equal(wallet1.ok, true);
    assert.equal(wallet2.ok, true);

    assert.equal(wallet1.value.address, wallet2.value.address);
  });

  it('generates different wallets for different indexes', () => {
    const wallet1 = getWallet(seedPhrase, 0);
    const wallet2 = getWallet(seedPhrase, 1);

    assert.equal(wallet1.ok, true);
    assert.equal(wallet2.ok, true);

    assert.notEqual(wallet1.value.address, wallet2.value.address);
  });

  it('rejects invalid indexes', () => {
    const res1 = getWallet(seedPhrase, -1);
    const res2 = getWallet(seedPhrase, 20);
    assert.equal(res1.ok, false);
    assert.equal(res2.ok, false);
  });

  it('generates different wallets for different seeds', () => {
    const seedPhrase2 =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const wallet1 = getWallet(seedPhrase, 0);
    const wallet2 = getWallet(seedPhrase2, 0);

    assert.equal(wallet1.ok, true);
    assert.equal(wallet2.ok, true);

    assert.notEqual(wallet1.value.address, wallet2.value.address);
  });
});
