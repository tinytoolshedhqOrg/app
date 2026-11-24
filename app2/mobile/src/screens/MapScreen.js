import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, radius } from '../theme';
import { nearestOpen, haversineMeters, isOpenNow } from '../lib/geo';
import { placeLabel, googleMapsUrls } from '../lib/placeLabel';
import { fetchComments, submitComment } from '../lib/community';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  cellKey,
  clearPlacesCache,
  loadPlacesNear,
  loadPlacesInRegion,
  regionExceedsCellLimit,
} from '@shared/places';
import { createPlacesCacheAdapter, syncPlacesManifest } from '../lib/placesCache';
import { isProUnlocked } from '../lib/entitlements';
import {
  ensureFullPackIndexed,
  hasLocalFullPack,
  isFullPackIndexed,
  loadCellFromFullPack,
} from '../lib/fullPack';

let _loadCellSync;
try {
  const reg = require('../data/cellRegistry');
  _loadCellSync = reg.loadCellSync;
} catch {
  _loadCellSync = undefined;
}
import PlaceDetailSheet from '../components/PlaceDetailSheet';
import HelpModal from '../components/HelpModal';
import { t, useLanguage } from '../i18n';
import UnlockProModal from '../components/UnlockProModal';

const DEFAULT_CENTER = { lat: 22.6273, lng: 120.3014 };
const LOCATE_TIMEOUT_MS = 6000;
const POOL_SIZE = 25;
const NEAR_MARKER_CAP = 3;
const ALL_MARKER_INITIAL = 20;
const ALL_MARKER_CAP = 80;
const REGION_LOAD_DEBOUNCE_MS = 600;
const RECENTER_DELTA = 0.04;
const PLACES_BASE_URL = (process.env.EXPO_PUBLIC_PLACES_URL || '').replace(/\/$/, '');
const placesCacheAdapter = createPlacesCacheAdapter();

function regionAround(lat, lng, delta = RECENTER_DELTA) {
  return {
    latitude: lat,
    longitude: lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

/** Ignore clustering / GPS jitter that retriggers onRegionChangeComplete. */
function regionChangedEnough(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  const latEps = Math.max(0.0005, Number(prev.latitudeDelta) * 0.02);
  const lngEps = Math.max(0.0005, Number(prev.longitudeDelta) * 0.02);
  const dEps = Math.max(0.002, Number(prev.latitudeDelta) * 0.08);
  return (
    Math.abs(prev.latitude - next.latitude) > latEps ||
    Math.abs(prev.longitude - next.longitude) > lngEps ||
    Math.abs(prev.latitudeDelta - next.latitudeDelta) > dEps ||
    Math.abs(prev.longitudeDelta - next.longitudeDelta) > dEps
  );
}

function placeInRegion(place, region) {
  if (!region) return true;
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return (
    place.lat >= region.latitude - halfLat &&
    place.lat <= region.latitude + halfLat &&
    place.lng >= region.longitude - halfLng &&
    place.lng <= region.longitude + halfLng
  );
}

function coordsFrom(loc) {
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('location timeout')), ms);
    }),
  ]);
}

function runningInExpoGo() {
  try {
    const Constants = require('expo-constants').default ?? require('expo-constants');
    return (
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === 'storeClient'
    );
  } catch {
    return false;
  }
}

async function openGoogleMaps(place) {
  // Coordinates first so a generic category like 咖啡 is not sent as the search.
  // The app uses Google Maps (web destination= / app daddr=), not Apple Maps.
  const urls = googleMapsUrls(place);
  if (!urls) {
    Alert.alert(t('map.navFailTitle'), t('map.navFailBody'));
    return;
  }

  const openWeb = async () => {
    await Linking.openURL(urls.web);
  };

  try {
    if (runningInExpoGo()) {
      await openWeb();
      return;
    }
    const canOpenApp = await Linking.canOpenURL(urls.app).catch(() => false);
    await Linking.openURL(canOpenApp ? urls.app : urls.web);
  } catch (e) {
    try {
      await openWeb();
    } catch {
      Alert.alert(t('map.mapsFailTitle'), e?.message || t('map.tryAgain'));
    }
  }
}

export default function MapScreen() {
  useLanguage();
  const mapRef = useRef(null);
  const [status, setStatus] = useState('locating');
  const [userPos, setUserPos] = useState(DEFAULT_CENTER);
  const [places, setPlaces] = useState([]);
  const [placesStatus, setPlacesStatus] = useState('idle');
  const [viewportPlaces, setViewportPlaces] = useState([]);
  const [viewportStatus, setViewportStatus] = useState('idle');
  const [mapCenter, setMapCenter] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);
  const [comments, setComments] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [packReady, setPackReady] = useState(false);
  const [recentering, setRecentering] = useState(false);
  const [allMarkerLimit, setAllMarkerLimit] = useState(ALL_MARKER_INITIAL);

  const [cacheReady, setCacheReady] = useState(!PLACES_BASE_URL);
  const userCell = userPos ? cellKey(userPos.lat, userPos.lng) : null;
  const regionTimer = useRef(null);
  const didInitialFit = useRef(false);
  const skipNextRegion = useRef(false);
  const viewportReq = useRef(0);
  const lastCommunityKey = useRef('');
  const mapRegionRef = useRef(null);
  const showAllRef = useRef(false);
  const packReadyRef = useRef(false);

  const placesLoadOptions = useCallback(() => {
    if (packReadyRef.current && isFullPackIndexed()) {
      return {
        baseUrl: '',
        loadCellSync: loadCellFromFullPack,
        cache: true,
      };
    }
    return {
      baseUrl: PLACES_BASE_URL,
      loadCellSync: _loadCellSync,
      cacheAdapter: placesCacheAdapter,
    };
  }, []);

  const loadRegion = useCallback(async (lat, lng, { mergePlaces = false } = {}) => {
    try {
      const rows = await loadPlacesNear(lat, lng, placesLoadOptions());
      if (mergePlaces) {
        if (rows.length) {
          setPlaces((prev) => {
            const byId = new Map(prev.map((p) => [p.id, p]));
            for (const r of rows) if (r?.id != null) byId.set(r.id, r);
            return [...byId.values()];
          });
        }
        setPlacesStatus('ready');
      }
    } catch (e) {
      console.warn('places load failed', e?.message || e);
      if (mergePlaces) setPlacesStatus('error');
    }
  }, [placesLoadOptions]);

  const loadViewport = useCallback(async (region) => {
    if (!region) return;
    const req = ++viewportReq.current;
    if (regionExceedsCellLimit(region)) {
      setViewportPlaces([]);
      setViewportStatus('zoomedOut');
      return;
    }
    setViewportStatus('loading');
    try {
      const rows = await loadPlacesInRegion(region, placesLoadOptions());
      if (req !== viewportReq.current) return;
      setViewportPlaces(rows);
      setViewportStatus('ready');
    } catch (e) {
      if (req !== viewportReq.current) return;
      console.warn('viewport load failed', e?.message || e);
      setViewportStatus('error');
    }
  }, [placesLoadOptions]);

  const reloadAfterPack = useCallback(async () => {
    clearPlacesCache();
    packReadyRef.current = true;
    setPackReady(true);
    if (!userPos) return;
    setPlacesStatus('loading');
    setPlaces([]);
    setViewportPlaces([]);
    await loadRegion(userPos.lat, userPos.lng, { mergePlaces: true });
    if (showAllRef.current && mapRegionRef.current) {
      await loadViewport(mapRegionRef.current);
    }
  }, [userPos, loadRegion, loadViewport]);

  const reloadAfterPackCleared = useCallback(async () => {
    clearPlacesCache();
    packReadyRef.current = false;
    setPackReady(false);
    if (!userPos) return;
    setPlacesStatus('loading');
    setPlaces([]);
    setViewportPlaces([]);
    await loadRegion(userPos.lat, userPos.lng, { mergePlaces: true });
    if (showAllRef.current && mapRegionRef.current) {
      await loadViewport(mapRegionRef.current);
    }
  }, [userPos, loadRegion, loadViewport]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const unlocked = await isProUnlocked();
      if (unlocked && (await hasLocalFullPack())) {
        const ok = await ensureFullPackIndexed();
        if (alive && ok) {
          packReadyRef.current = true;
          setPackReady(true);
        }
      }
      await syncPlacesManifest(PLACES_BASE_URL);
      if (alive) setCacheReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        t('map.cloudTitle'),
        t('map.cloudBody'),
      );
    }
  }, []);

  useEffect(() => {
    if (!userPos || !cacheReady) return;
    setPlacesStatus('loading');
    setMapCenter((prev) => prev || { lat: userPos.lat, lng: userPos.lng });
    setMapRegion((prev) => {
      if (prev) return prev;
      const next = {
        latitude: userPos.lat,
        longitude: userPos.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
      mapRegionRef.current = next;
      return next;
    });
    loadRegion(userPos.lat, userPos.lng, { mergePlaces: true });
  }, [userCell, loadRegion, cacheReady]);

  useEffect(() => {
    return () => {
      if (regionTimer.current) clearTimeout(regionTimer.current);
    };
  }, []);

  const handleRegionChange = useCallback(
    (region) => {
      if (skipNextRegion.current) {
        skipNextRegion.current = false;
        return;
      }
      if (!regionChangedEnough(mapRegionRef.current, region)) return;

      mapRegionRef.current = region;
      setMapRegion(region);
      setMapCenter({ lat: region.latitude, lng: region.longitude });
      if (regionTimer.current) clearTimeout(regionTimer.current);
      regionTimer.current = setTimeout(() => {
        loadRegion(region.latitude, region.longitude, { mergePlaces: false });
        if (showAllRef.current) loadViewport(region);
      }, REGION_LOAD_DEBOUNCE_MS);
    },
    [loadRegion, loadViewport],
  );

  useEffect(() => {
    showAllRef.current = showAll;
  }, [showAll]);

  // Load viewport once when entering 全部 (later pans go through the debounce above).
  useEffect(() => {
    if (!showAll || !cacheReady) return;
    const region = mapRegionRef.current;
    if (!region) return;
    loadViewport(region);
  }, [showAll, cacheReady, loadViewport]);

  useEffect(() => {
    if (!showAll) {
      setAllMarkerLimit(ALL_MARKER_INITIAL);
      return;
    }
    setAllMarkerLimit(ALL_MARKER_INITIAL);
    const t = setTimeout(() => setAllMarkerLimit(ALL_MARKER_CAP), 400);
    return () => clearTimeout(t);
  }, [showAll, viewportPlaces]);

  const refreshCommunity = useCallback(async (placeIds) => {
    if (!isSupabaseConfigured || !placeIds?.length) return;
    try {
      const c = await fetchComments(placeIds);
      setComments((prev) => ({ ...prev, ...c }));
    } catch (e) {
      const msg = e?.message || String(e);
      const details = e?.details || e?.hint || '';
      console.warn('community refresh failed', msg, details || '');
    }
  }, []);

  useEffect(() => {
    const origin = showAll ? mapCenter || userPos : userPos;
    const source = showAll ? viewportPlaces : places;
    if (!origin || !source.length || !isSupabaseConfigured) return;
    const ids = nearestOpen(origin, source, POOL_SIZE).map((p) => p.id);
    const key = `${showAll ? 'all' : 'near'}:${ids.join(',')}`;
    if (key === lastCommunityKey.current) return;
    lastCommunityKey.current = key;
    refreshCommunity(ids);
  }, [userPos, mapCenter, places, viewportPlaces, showAll, refreshCommunity]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let perm = 'denied';
        try {
          const result = await withTimeout(
            Location.requestForegroundPermissionsAsync(),
            LOCATE_TIMEOUT_MS,
          );
          perm = result?.status;
        } catch {
          if (!alive) return;
          setStatus('error');
          return;
        }
        if (!alive) return;
        if (perm !== 'granted') {
          setStatus('denied');
          return;
        }

        let last = null;
        try {
          last = await withTimeout(Location.getLastKnownPositionAsync(), 2500);
        } catch {
          last = null;
        }
        if (!alive) return;
        if (last) {
          setUserPos(coordsFrom(last));
          setStatus('ready');
        }

        try {
          const loc = await withTimeout(
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Low,
            }),
            LOCATE_TIMEOUT_MS,
          );
          if (!alive) return;
          setUserPos(coordsFrom(loc));
          setStatus('ready');
        } catch {
          if (!alive) return;
          if (!last) setStatus('error');
        }
      } catch {
        if (!alive) return;
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pool = useMemo(() => {
    if (!userPos || !places.length) return [];
    return nearestOpen(userPos, places, POOL_SIZE);
  }, [userPos, places]);

  const nearest = useMemo(
    () => pool.slice(0, NEAR_MARKER_CAP),
    [pool],
  );

  const allOpen = useMemo(() => {
    if (!viewportPlaces.length) return [];
    const origin = mapCenter || userPos;
    return viewportPlaces
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .filter((p) => placeInRegion(p, mapRegion))
      .filter((p) => isOpenNow(p.營業時間))
      .map((p) => ({
        ...p,
        distance: origin
          ? haversineMeters(origin, { lat: p.lat, lng: p.lng })
          : 0,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, allMarkerLimit);
  }, [viewportPlaces, mapRegion, mapCenter, userPos, allMarkerLimit]);

  const mapMarkers = useMemo(
    () => (showAll ? allOpen : nearest),
    [showAll, allOpen, nearest],
  );

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const raw =
      nearest.find((p) => p.id === selectedId) ||
      allOpen.find((p) => p.id === selectedId) ||
      places.find((p) => p.id === selectedId) ||
      viewportPlaces.find((p) => p.id === selectedId) ||
      null;
    if (!raw) return null;
    if (!userPos) return raw;
    return {
      ...raw,
      distance: haversineMeters(userPos, { lat: raw.lat, lng: raw.lng }),
    };
  }, [allOpen, nearest, places, viewportPlaces, selectedId, userPos]);

  useEffect(() => {
    if (didInitialFit.current || !mapRef.current || !userPos) return;
    if (status === 'locating') return;
    if (placesStatus === 'idle' || placesStatus === 'loading') return;
    didInitialFit.current = true;
    const coords = [
      { latitude: userPos.lat, longitude: userPos.lng },
      ...nearest.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    ];
    if (coords.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: userPos.lat,
          longitude: userPos.lng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        400,
      );
      return;
    }
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
  }, [userPos, nearest, placesStatus, status]);

  const selectPlace = useCallback((place) => {
    if (!place?.id) return;
    skipNextRegion.current = true;
    if (mapRef.current && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
      mapRef.current.animateToRegion(
        {
          latitude: place.lat,
          longitude: place.lng,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        350,
      );
    }
    setTimeout(() => setSelectedId(place.id), 50);
  }, []);

  const closeSelected = useCallback(() => {
    setSelectedId(null);
  }, []);

  const recenterOnUser = useCallback(async () => {
    if (recentering) return;
    setRecentering(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        Alert.alert(t('map.locateFailTitle'), t('map.locatePermission'));
        return;
      }

      let pos = userPos;
      try {
        const loc = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
          }),
          LOCATE_TIMEOUT_MS,
        );
        pos = coordsFrom(loc);
        setUserPos(pos);
        setStatus('ready');
      } catch {
        if (!pos || status !== 'ready') {
          Alert.alert(t('map.locateFailTitle'), t('map.tryAgain'));
          return;
        }
      }

      const homeRegion = regionAround(pos.lat, pos.lng);
      mapRegionRef.current = homeRegion;
      setMapCenter({ lat: pos.lat, lng: pos.lng });
      setMapRegion(homeRegion);
      skipNextRegion.current = true;
      mapRef.current?.animateToRegion(homeRegion, 400);
      if (showAllRef.current) loadViewport(homeRegion);
      setTimeout(() => {
        skipNextRegion.current = false;
      }, 500);
    } finally {
      setRecentering(false);
    }
  }, [recentering, userPos, status, loadViewport]);

  const handleSubmitComment = useCallback(
    async (text) => {
      if (!selectedId) return;
      if (!isSupabaseConfigured) {
        Alert.alert(t('map.cloudTitle'), t('map.cloudComment'));
        return;
      }
      try {
        const list = await submitComment(selectedId, text);
        setComments((prev) => ({ ...prev, [selectedId]: list }));
      } catch (e) {
        Alert.alert(t('map.commentFailTitle'), e?.message || t('map.tryAgain'));
      }
    },
    [selectedId],
  );

  const markerCount = mapMarkers.length;

  return (
    <View style={styles.fill}>
      <View style={styles.fill}>
        <View style={styles.bar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>急廁 Go</Text>
          </View>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, !showAll && styles.tabActive]}
              onPress={() => setShowAll(false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, !showAll && styles.tabTextActive]}>{t('map.nearby')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, showAll && styles.tabActive]}
              onPress={() => setShowAll(true)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, showAll && styles.tabTextActive]}>{t('map.all')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.helpBtn, packReady ? styles.unlockBtnReady : styles.unlockBtn]}
            onPress={() => setUnlockOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={packReady ? t('map.unlockedA11y') : t('map.unlockA11y')}
          >
            <Text style={[styles.helpText, packReady && styles.unlockTextReady]}>
              {packReady ? t('map.offline') : t('map.unlock')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={() => setHelpOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.helpText}>{t('map.help')}</Text>
          </TouchableOpacity>
        </View>

        {showAll && markerCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {t('map.openCount', { count: markerCount })}
            </Text>
          </View>
        )}

        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={{
              latitude: userPos.lat,
              longitude: userPos.lng,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
            }}
            showsUserLocation={status === 'ready'}
            showsMyLocationButton={false}
            toolbarEnabled={false}
            moveOnMarkerPress={false}
            onRegionChangeComplete={handleRegionChange}
          >
            {mapMarkers.map((place, index) => (
              <Marker
                key={place.id}
                coordinate={{ latitude: place.lat, longitude: place.lng }}
                title={`${index + 1}. ${placeLabel(place)}`}
                description={place.地址}
                pinColor={colors.brand}
                tracksViewChanges={false}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  selectPlace(place);
                }}
              />
            ))}
          </MapView>
          {status === 'locating' ? (
            <View style={styles.locatingBanner} pointerEvents="none">
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.locatingText}>{t('map.locating')}</Text>
            </View>
          ) : null}
        </View>

        {selected && (
          <PlaceDetailSheet
            key={selected.id}
            place={selected}
            comments={comments[selected.id] || []}
            seedNotes={selected.備註 || []}
            onClose={closeSelected}
            onNavigate={openGoogleMaps}
            onSubmitComment={handleSubmitComment}
          />
        )}

        {userPos ? (
          <TouchableOpacity
            style={[
              styles.locateBtn,
              {
                bottom: selected
                  ? Math.round(Dimensions.get('window').height * 0.34) + 12
                  : 28,
              },
            ]}
            onPress={recenterOnUser}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('map.recenterA11y')}
            disabled={recentering}
          >
            {recentering ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <MaterialIcons name="my-location" size={22} color={colors.brandDeep} />
            )}
          </TouchableOpacity>
        ) : null}

        <HelpModal
          visible={helpOpen}
          onClose={() => setHelpOpen(false)}
        />

        <UnlockProModal
          visible={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          placesBaseUrl={PLACES_BASE_URL}
          onPackReady={reloadAfterPack}
          onPackCleared={reloadAfterPackCleared}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: colors.mapBg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 56 : 18,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(26,155,142,0.15)',
    zIndex: 2,
  },
  brand: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.brandDeep,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#E8F7F4',
  },
  tabActive: {
    backgroundColor: colors.brand,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDeep,
  },
  tabTextActive: {
    color: '#fff',
  },
  helpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: '#E7F6F3',
  },
  unlockBtn: {
    backgroundColor: colors.accent,
  },
  unlockBtnReady: {
    backgroundColor: '#E7F6F3',
  },
  helpText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDeep,
  },
  unlockTextReady: {
    color: colors.brandDeep,
  },
  countBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 106 : 68,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    zIndex: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDeep,
  },
  mapWrap: {
    flex: 1,
    backgroundColor: colors.mapBg,
  },
  locatingBanner: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    zIndex: 4,
  },
  locatingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDeep,
  },
  locateBtn: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
});
