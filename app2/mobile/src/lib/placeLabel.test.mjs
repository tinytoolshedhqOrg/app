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

test('named Vietnam venue searches by name, not coordinates, and biases with center', () => {
  const vn = {
    type: '咖啡',
    name: 'Highlands Coffee',
    地址: '',
    lat: 10.7747454,
    lng: 106.6982421,
  };
  assert.equal(navigationTextQuery(vn), 'Highlands Coffee');
  assert.equal(navigationDestination(vn), 'Highlands Coffee');
  const urls = googleMapsUrls(vn);
  assert.equal(
    urls.web,
    'https://www.google.com/maps/search/?api=1&query=Highlands%20Coffee&center=10.7747454,106.6982421',
  );
  assert.equal(
    urls.app,
    'comgooglemaps://?q=Highlands%20Coffee&center=10.7747454,106.6982421',
  );
});

test('named Vietnam venue with address includes the address in the search', () => {
  const vn = {
    type: '咖啡',
    name: 'Highlands Coffee',
    地址: '187 Đường Phạm Ngũ Lão',
    lat: 10.7686142,
    lng: 106.6934398,
  };
  assert.equal(navigationTextQuery(vn), 'Highlands Coffee 187 Đường Phạm Ngũ Lão');
  const urls = googleMapsUrls(vn);
  const q = encodeURIComponent('Highlands Coffee 187 Đường Phạm Ngũ Lão');
  assert.equal(
    urls.web,
    `https://www.google.com/maps/search/?api=1&query=${q}&center=10.7686142,106.6934398`,
  );
  assert.equal(urls.app, `comgooglemaps://?q=${q}&center=10.7686142,106.6934398`);
});

test('Taiwan 7-11 searches by brand label plus address, biased to the pin', () => {
  const tw = {
    type: '7-11',
    name: '台場',
    地址: '台北市松山區八德路三段20-2號',
    lat: 25.0481234,
    lng: 121.5656789,
  };
  assert.equal(placeLabel(tw), '7-11 台場');
  assert.equal(navigationTextQuery(tw), '7-11 台場 台北市松山區八德路三段20-2號');
  assert.equal(navigationDestination(tw), '7-11 台場 台北市松山區八德路三段20-2號');
  const urls = googleMapsUrls(tw);
  const q = encodeURIComponent('7-11 台場 台北市松山區八德路三段20-2號');
  assert.equal(
    urls.web,
    `https://www.google.com/maps/search/?api=1&query=${q}&center=25.0481234,121.5656789`,
  );
  assert.equal(urls.app, `comgooglemaps://?q=${q}&center=25.0481234,121.5656789`);
});

test('unnamed places fall back to coordinate directions', () => {
  const toilet = { type: '公廁', name: '', lat: 10.8010103, lng: 106.6647105 };
  assert.equal(placeLabel(toilet), '公廁');
  assert.equal(navigationTextQuery(toilet), '');
  assert.equal(navigationDestination(toilet), '10.8010103,106.6647105');
  const urls = googleMapsUrls(toilet);
  assert.equal(
    urls.web,
    'https://www.google.com/maps/dir/?api=1&destination=10.8010103%2C106.6647105&travelmode=walking',
  );
  assert.equal(urls.app, 'comgooglemaps://?daddr=10.8010103%2C106.6647105&directionsmode=walking');
});

test('named place without coords still searches by name', () => {
  const cafe = { type: '咖啡', name: 'Highlands Coffee', 地址: '187 Đường Phạm Ngũ Lão' };
  assert.equal(navigationTextQuery(cafe), 'Highlands Coffee 187 Đường Phạm Ngũ Lão');
  assert.equal(coordinateDestination(cafe), '');
  const urls = googleMapsUrls(cafe);
  const q = encodeURIComponent('Highlands Coffee 187 Đường Phạm Ngũ Lão');
  assert.equal(urls.web, `https://www.google.com/maps/search/?api=1&query=${q}`);
  assert.equal(urls.app, `comgooglemaps://?q=${q}`);
});

test('generic type alone with no name or coords cannot navigate', () => {
  const bare = { type: '公廁' };
  assert.equal(navigationDestination(bare), '');
  assert.equal(googleMapsUrls(bare), null);
});
