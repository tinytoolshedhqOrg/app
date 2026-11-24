import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { colors, radius } from '../theme';
import { formatDistance, formatHours, isHoursUnknown } from '../lib/geo';
import { placeLabel } from '../lib/placeLabel';
import { MAX_COMMENT_LEN, MAX_COMMENTS_PER_PLACE } from '../lib/community';
import { t, useLanguage } from '../i18n';

export default function PlaceDetailSheet({
  place,
  comments = [],
  seedNotes = [],
  onClose,
  onNavigate,
  onSubmitComment,
}) {
  useLanguage();
  const sheetRef = useRef(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const snapPoints = useMemo(() => ['34%', '78%'], []);

  const previewComments = useMemo(() => {
    const local = comments.map((c) => c.text);
    const merged = [...local, ...seedNotes.filter(Boolean)];
    return merged.slice(0, sheetIndex === 0 ? 3 : MAX_COMMENTS_PER_PLACE);
  }, [comments, seedNotes, sheetIndex]);

  const handleChange = useCallback((index) => {
    if (index < 0) {
      onClose?.();
      return;
    }
    setSheetIndex(index);
  }, [onClose]);

  const submit = () => {
    const text = draft.trim().slice(0, MAX_COMMENT_LEN);
    if (!text) return;
    onSubmitComment?.(text);
    setDraft('');
  };

  if (!place) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={handleChange}
      onClose={onClose}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={24}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>WC</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {placeLabel(place)}
              </Text>
              <Text style={styles.addr}>{place.地址}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatDistance(place.distance)}</Text>
            <Text style={[styles.meta, isHoursUnknown(place.營業時間) && styles.metaUnknown]}>
              {isHoursUnknown(place.營業時間)
                ? t('detail.hoursUnknown')
                : formatHours(place.營業時間)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.navBtn}
            activeOpacity={0.85}
            onPress={() => onNavigate?.(place)}
          >
            <Text style={styles.navText}>{t('detail.navigate')}</Text>
          </TouchableOpacity>

          <Text style={styles.section}>
            {sheetIndex === 0 ? t('detail.recentComments') : t('detail.allComments')}
            {sheetIndex === 0 ? t('detail.swipeHint') : ''}
          </Text>

          {previewComments.length === 0 ? (
            <Text style={styles.empty}>{t('detail.noComments')}</Text>
          ) : (
            previewComments.map((text, i) => (
              <View key={`${text}-${i}`} style={styles.commentChip}>
                <Text style={styles.commentText}>{text}</Text>
              </View>
            ))
          )}

          {sheetIndex >= 1 && (
            <View style={styles.compose}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={(value) => setDraft(value.slice(0, MAX_COMMENT_LEN))}
                placeholder={t('detail.placeholder', { max: MAX_COMMENT_LEN })}
                placeholderTextColor={colors.muted}
                maxLength={MAX_COMMENT_LEN}
                returnKeyType="send"
                onSubmitEditing={submit}
              />
              <Text style={styles.counter}>
                {draft.trim().length}/{MAX_COMMENT_LEN}
              </Text>
              <TouchableOpacity
                style={[styles.sendBtn, !draft.trim() && styles.sendDisabled]}
                disabled={!draft.trim()}
                onPress={submit}
                activeOpacity={0.85}
              >
                <Text style={styles.sendText}>{t('detail.send')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheetScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  handle: {
    backgroundColor: 'rgba(23,51,47,0.2)',
    width: 42,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  addr: {
    marginTop: 2,
    fontSize: 13,
    color: colors.muted,
  },
  close: {
    fontSize: 18,
    color: colors.muted,
    paddingHorizontal: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  meta: {
    fontSize: 12,
    color: colors.brandDeep,
    backgroundColor: '#E8F7F4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  metaUnknown: {
    color: '#999',
    backgroundColor: '#F0F0F0',
  },
  navBtn: {
    marginTop: 14,
    backgroundColor: colors.ink,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  navText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    marginVertical: 8,
  },
  commentChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F7FFFC',
    borderWidth: 1,
    borderColor: 'rgba(26,155,142,0.12)',
    marginBottom: 8,
  },
  commentText: {
    fontSize: 15,
    color: colors.ink,
  },
  compose: {
    marginTop: 8,
    gap: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: 'rgba(26,155,142,0.25)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#fff',
  },
  counter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: colors.muted,
  },
  sendBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  sendDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: '#fff',
    fontWeight: '800',
  },
});
