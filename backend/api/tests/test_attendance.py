import datetime
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from api.models import AttendanceRecord, Employee, ScheduleEntry
from api.tasks import auto_mark_absent_attendance


class AttendanceAutoAbsentTests(TestCase):
    def setUp(self):
        self.employee = Employee.objects.create(
            name="Test Employee",
            position="Staff",
            status="active",
        )
        self.fixed_now = timezone.make_aware(
            datetime.datetime(2025, 1, 6, 12, 0, 0),
            timezone.get_current_timezone(),
        )
        day_label = self.fixed_now.strftime("%A")
        ScheduleEntry.objects.create(
            employee=self.employee,
            day=day_label,
            start_time=datetime.time(8, 0),
            end_time=datetime.time(10, 0),
        )

    def _run_task(self):
        with patch("api.tasks.timezone.now", return_value=self.fixed_now):
            auto_mark_absent_attendance()

    def test_marks_absent_when_missing_clock_out(self):
        AttendanceRecord.objects.create(
            employee=self.employee,
            date=self.fixed_now.date(),
            check_in=datetime.time(8, 30),
            status=AttendanceRecord.STATUS_PRESENT,
        )
        self._run_task()
        record = AttendanceRecord.objects.get(
            employee=self.employee, date=self.fixed_now.date()
        )
        self.assertEqual(record.status, AttendanceRecord.STATUS_ABSENT)
        self.assertIn("clock-out", (record.notes or "").lower())

    def test_keeps_clocked_out_record(self):
        AttendanceRecord.objects.create(
            employee=self.employee,
            date=self.fixed_now.date(),
            check_in=datetime.time(8, 30),
            check_out=datetime.time(11, 0),
            status=AttendanceRecord.STATUS_PRESENT,
        )
        self._run_task()
        record = AttendanceRecord.objects.get(
            employee=self.employee, date=self.fixed_now.date()
        )
        self.assertEqual(record.status, AttendanceRecord.STATUS_PRESENT)
