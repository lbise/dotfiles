function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

// JavaScript starts weeks on Sunday. The calendar starts on Monday.
function firstWeekday(date) {
  var sundayBased = monthStart(date).getDay()
  return sundayBased === 0 ? 6 : sundayBased - 1
}

function dayAt(index, date) {
  var day = index - firstWeekday(date) + 1
  return day >= 1 && day <= daysInMonth(date) ? day : 0
}

function sameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function sameMonth(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
}

function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

if (typeof module !== "undefined") {
  module.exports = {
    monthStart: monthStart,
    daysInMonth: daysInMonth,
    firstWeekday: firstWeekday,
    dayAt: dayAt,
    sameDay: sameDay,
    sameMonth: sameMonth,
    shiftMonth: shiftMonth
  }
}
