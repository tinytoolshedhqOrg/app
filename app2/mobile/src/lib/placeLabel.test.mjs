import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isGenericPlaceType,
  placeLabel,
  coordinateDestination,
  navigationTextQuery,
  navigationDestination,
  googleMapsUrls,
} from './placeLabel.js';

test('generic types are detected', () => {
  for (const type of ['咖啡', '餐廳', '公廁', '商場', '博物館', '車站', '公車站', '景點', '加油站', '公衆トイレ']) {
    assert.equal(isGenericPlaceType(type), true, type);
  }
  for (const type of ['7-11', 'family', '肯德基', '路易莎', '寶雅', '星巴克', '港鐵', 'マクドナルド', '加德士']) {
    assert.equal(isGenericPlaceType(type), false, type);
  }
});

test('placeLabel drops generic category when a name exists', () => {
  assert.equal(placeLabel({ type: '咖啡', name: 'Highlands Coffee' }), 'Highlands Coffee');
  assert.equal(placeLabel({ type: '公廁', name: '' }), '公廁');
  assert.equal(placeLabel({ type: '公廁' }), '公廁');
  assert.equal(placeLabel({ type: '7-11', name: '台場' }), '7-11 台場');
  assert.equal(placeLabel({ type: '肯德基', name: '肯德基' }), '肯德基 肯德基');
  assert.equal(placeLabel({ type: '港鐵', name: '台北車站' }), '港鐵 台北車站');
});

test('navigation uses coordinates when present', () => {
  const vn = {
    type: '咖啡',
    name: 'Highlands Coffee',
    地址: '',
    lat: 10.7747454,
    lng: 106.6982421,
  };
  assert.equal(navigationTextQuery(vn), 'Highlands Coffee');
  assert.equal(navigationDestination(vn), '10.7747454,106.6982421');
  const urls = googleMapsUrls(vn);
  assert.equal(
    urls.web,
    'https://www.google.com/maps/dir/?api=1&destination=10.7747454%2C106.6982421&travelmode=walking',
  );
  assert.equal(urls.app, 'comgooglemaps://?daddr=10.7747454%2C106.6982421&directionsmode=walking');
});

test('Taiwan 7-11 destination is still the pin coordinates', () => {
  const tw = {
    type: '7-11',
    name: '台場',
    地址: '台北市松山區八德路三段20-2號',
    lat: 25.0481234,
    lng: 121.5656789,
  };
  assert.equal(placeLabel(tw), '7-11 台場');
  assert.equal(navigationTextQuery(tw), '7-11 台場 台北市松山區八德路三段20-2號');
  assert.equal(navigationDestination(tw), '25.0481234,121.5656789');
});

test('falls back to a text query without generic types if coords are missing', () => {
  const cafe = { type: '咖啡', name: 'Highlands Coffee', 地址: '187 Đường Phạm Ngũ Lão' };
  assert.equal(navigationTextQuery(cafe), 'Highlands Coffee 187 Đường Phạm Ngũ Lão');
  assert.equal(navigationDestination(cafe), 'Highlands Coffee 187 Đường Phạm Ngũ Lão');
  assert.equal(coordinateDestination(cafe), '');
  const bare = { type: '公廁' };
  assert.equal(navigationDestination(bare), '');
  assert.equal(googleMapsUrls(bare), null);
});
