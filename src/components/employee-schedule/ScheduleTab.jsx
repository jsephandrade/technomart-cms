import React from 'react';
import WeeklyScheduleCard from '@/components/employee-schedule/WeeklyScheduleCard';
import ScheduleCalendar from '@/components/schedule/ScheduleCalendar';

const ScheduleTab = ({
  daysOfWeek,
  displayEmployees,
  employeeDirectory,
  schedule,
  canManage,
  setEditingSchedule,
  handleDeleteSchedule,
  lookupEmployeeName,
  setNewScheduleEntry,
  handleScheduleDialogOpenChange,
  defaultScheduleEntry,
  onOpenManageEmployees,
  onOpenAddSchedule,
  onClearAllSchedules,
  onEditDaySchedule,
}) => (
  <div className="mt-2 space-y-6">
    <div className="grid gap-2 items-start lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.6fr)] 2xl:grid-cols-[minmax(0,1.8fr)_minmax(0,0.6fr)]">
      <WeeklyScheduleCard
        daysOfWeek={daysOfWeek}
        employeeList={displayEmployees}
        employeeDirectory={employeeDirectory}
        schedule={schedule}
        onEditSchedule={canManage ? setEditingSchedule : undefined}
        onDeleteSchedule={handleDeleteSchedule}
        onAddScheduleForDay={(employeeId, day) => {
          if (!canManage) return;
          setNewScheduleEntry({
            ...defaultScheduleEntry,
            employeeId,
            employeeName: lookupEmployeeName(employeeId),
            day,
          });
          handleScheduleDialogOpenChange(true);
        }}
        onOpenManageEmployees={() => {
          if (typeof onOpenManageEmployees === 'function') {
            onOpenManageEmployees();
          }
        }}
        onOpenAddSchedule={() => {
          if (typeof onOpenAddSchedule === 'function') {
            onOpenAddSchedule();
          }
        }}
        canManage={canManage}
        onClearAllSchedules={onClearAllSchedules}
        onEditDaySchedule={onEditDaySchedule}
      />
      <div className="space-y-6 lg:w-full lg:max-w-md lg:justify-self-end">
        <ScheduleCalendar
          schedule={schedule}
          employeeList={displayEmployees}
          className="w-full max-w-none lg:max-w-sm lg:ml-auto"
        />
      </div>
    </div>
  </div>
);

export default ScheduleTab;
