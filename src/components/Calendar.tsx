import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { T } from '../design-system/theme2';

interface CalendarProps {
  onDateSelect: (dateTs: number) => void;
  onMonthChange: (year: number, month: number) => void;
  markedDates: number[]; // Array of timestamps indicating days with attendance
}

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function Calendar({ onDateSelect, onMonthChange, markedDates }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Notify parent of month change to trigger sync
  useEffect(() => {
    onMonthChange(year, month);
  }, [year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // Generate grid cells
  const grid = useMemo(() => {
    const cells = [];
    // Padding for previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(null);
    }
    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d);
    }
    // Padding for next month
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [year, month, daysInMonth, firstDayOfMonth]);

  // Convert markedDates to a set of 'YYYY-MM-DD' strings for O(1) lookup
  const markedSet = useMemo(() => {
    const set = new Set<string>();
    for (const ts of markedDates) {
      const d = new Date(ts);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return set;
  }, [markedDates]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayPress = (day: number | null) => {
    if (!day) return;
    const newSelected = new Date(year, month, day);
    setSelectedDate(newSelected);
    // Return start of day timestamp
    onDateSelect(newSelected.getTime());
  };

  const isSelected = (day: number) => {
    return selectedDate.getFullYear() === year &&
           selectedDate.getMonth() === month &&
           selectedDate.getDate() === day;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getFullYear() === year &&
           today.getMonth() === month &&
           today.getDate() === day;
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={handlePrevMonth} style={({ pressed }) => [s.navBtn, pressed && s.pressed]}>
          <Text style={s.navArrow}>‹</Text>
        </Pressable>
        <Text style={s.monthTitle}>{MONTHS[month]} {year}</Text>
        <Pressable onPress={handleNextMonth} style={({ pressed }) => [s.navBtn, pressed && s.pressed]}>
          <Text style={s.navArrow}>›</Text>
        </Pressable>
      </View>

      {/* Days of Week */}
      <View style={s.weekDays}>
        {DAYS_OF_WEEK.map((d, i) => (
          <Text key={i} style={s.weekDayText}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={s.grid}>
        {grid.map((day, i) => {
          if (!day) return <View key={`empty-${i}`} style={s.cell} />;
          
          const selected = isSelected(day);
          const today = isToday(day);
          const marked = markedSet.has(`${year}-${month}-${day}`);

          return (
            <Pressable
              key={day}
              onPress={() => handleDayPress(day)}
              style={({ pressed }) => [
                s.cell,
                selected && s.cellSelected,
                today && !selected && s.cellToday,
                pressed && !selected && s.pressed
              ]}
            >
              <Text style={[
                s.dayText,
                selected && s.dayTextSelected,
                today && !selected && s.dayTextToday
              ]}>
                {day}
              </Text>
              {marked && <View style={[s.dot, selected && s.dotSelected]} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: T.white,
    borderRadius: T.r16,
    padding: T.sp16,
    borderWidth: 1,
    borderColor: T.hairline,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: T.sp16,
  },
  monthTitle: {
    fontSize: T.fs16,
    fontWeight: '700',
    color: T.black,
    fontFamily: T.font,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.offWhite,
    borderRadius: T.r8,
  },
  navArrow: {
    fontSize: T.fs18,
    color: T.charcoal,
    fontWeight: '600',
    lineHeight: 22,
  },
  weekDays: {
    flexDirection: 'row',
    marginBottom: T.sp8,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: T.fs12,
    fontWeight: '600',
    color: T.muted,
    fontFamily: T.font,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%', // 100 / 7
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: T.r12,
    marginVertical: 2,
  },
  cellSelected: {
    backgroundColor: T.yellow,
  },
  cellToday: {
    backgroundColor: T.offWhite,
    borderWidth: 1,
    borderColor: T.yellow,
  },
  dayText: {
    fontSize: T.fs14,
    color: T.black,
    fontFamily: T.font,
    fontWeight: '500',
  },
  dayTextSelected: {
    color: T.black,
    fontWeight: '700',
  },
  dayTextToday: {
    color: T.charcoal,
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.charcoal,
    position: 'absolute',
    bottom: 6,
  },
  dotSelected: {
    backgroundColor: T.black,
  },
  pressed: {
    opacity: 0.7,
  },
});
