export const ENROLLMENT_SELECT = `
  SELECT enrollment_id AS "enrollmentId", participant_id AS "participantId", class_id AS "classId",
         class_name AS "className", class_code AS "classCode", full_name AS "fullName",
         phone_number AS "phoneNumber", registration_number AS "registrationNumber",
         attendance_mode AS "attendanceMode", group_id AS "groupId", group_name AS "groupName",
         group_number AS "groupNumber"
  FROM enrollment_overview`

export const PHONE_PATTERN = /^\+?[0-9 ()-]{5,30}$/
