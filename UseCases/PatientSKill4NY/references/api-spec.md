# Medical SaaS API Reference

Base URL: `${MEDICAL_SAAS_API_BASE_URL:-http://111.229.202.81:8001}`

---

## 1. Patient Management (病患管理)

### GET /api/patients - List Patients
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| status | string | No | - | Filter by status |
| keyword | string | No | - | Search keyword |
| page | int | No | 1 | Page number (min: 1) |
| page_size | int | No | 20 | Items per page (1-100) |

**Response**: Array of `PatientOut`

### GET /api/patients/count - Count Patients
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status |
| keyword | string | No | Search keyword |

### GET /api/patients/{patient_id} - Get Patient
**Response**: `PatientOut`

### POST /api/patients - Create Patient
```json
{
  "name": "string (required)",
  "gender": "string | null",
  "age": "int | null",
  "phone": "string | null",
  "id_card": "string | null",
  "status": "string | null (default: 待跟进)",
  "source": "string | null",
  "assigned_to": "string | null",
  "notes": "string | null"
}
```
**Response**: `PatientOut`

### PUT /api/patients/{patient_id} - Update Patient
Same body as Create (name required).

### DELETE /api/patients/{patient_id} - Delete Patient

### PATCH /api/patients/{patient_id}/status - Update Patient Status
```json
{
  "status": "string (required)"
}
```

### PatientOut Schema
```json
{
  "id": "int",
  "name": "string",
  "gender": "string | null",
  "age": "int | null",
  "phone": "string | null",
  "id_card": "string | null",
  "status": "string (default: 待跟进)",
  "source": "string | null",
  "assigned_to": "string | null",
  "notes": "string | null",
  "created_at": "datetime | null",
  "updated_at": "datetime | null"
}
```

---

## 2. Follow-up Management (跟进记录)

### GET /api/patients/{patient_id}/follow-ups - List Follow-ups
**Response**: Array of `FollowUpOut`

### POST /api/patients/{patient_id}/follow-ups - Create Follow-up
```json
{
  "operator": "string | null",
  "action": "string | null",
  "content": "string | null"
}
```

### FollowUpOut Schema
```json
{
  "id": "int",
  "patient_id": "int",
  "operator": "string | null",
  "action": "string | null",
  "content": "string | null",
  "created_at": "datetime | null"
}
```

---

## 3. Doctor Management (医生管理)

### GET /api/doctors - List Doctors
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clinic_id | int | No | - | Filter by clinic |
| department | string | No | - | Filter by department |
| keyword | string | No | - | Search keyword |
| page | int | No | 1 | Page number |
| page_size | int | No | 20 | Items per page (1-100) |

**Response**: Array of `DoctorOut`

### GET /api/doctors/count - Count Doctors

### GET /api/doctors/{doctor_id} - Get Doctor

### POST /api/doctors - Create Doctor
```json
{
  "name": "string (required)",
  "title": "string | null",
  "clinic_id": "int | null",
  "department": "string | null",
  "phone": "string | null",
  "avatar": "string | null"
}
```

### PUT /api/doctors/{doctor_id} - Update Doctor
Same body as Create.

### DELETE /api/doctors/{doctor_id} - Delete Doctor

### DoctorOut Schema
```json
{
  "id": "int",
  "name": "string",
  "title": "string | null",
  "clinic_id": "int | null",
  "department": "string | null",
  "phone": "string | null",
  "avatar": "string | null",
  "created_at": "datetime | null",
  "clinic_name": "string | null"
}
```

---

## 4. Clinic Management (诊所管理)

### GET /api/clinics - List Clinics
| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| page | int | No | 1 |
| page_size | int | No | 20 |

### GET /api/clinics/count - Count Clinics

### GET /api/clinics/{clinic_id} - Get Clinic

### POST /api/clinics - Create Clinic
```json
{
  "name": "string (required)",
  "department": "string (required)",
  "address": "string | null",
  "phone": "string | null"
}
```

### PUT /api/clinics/{clinic_id} - Update Clinic
Same body as Create.

### DELETE /api/clinics/{clinic_id} - Delete Clinic

### ClinicOut Schema
```json
{
  "id": "int",
  "name": "string",
  "department": "string",
  "address": "string | null",
  "phone": "string | null",
  "created_at": "datetime | null"
}
```

---

## 5. Appointment Management (预约管理)

### GET /api/appointments - List Appointments
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| status | string | No | - | Filter by status |
| patient_id | int | No | - | Filter by patient |
| doctor_id | int | No | - | Filter by doctor |
| page | int | No | 1 | Page number |
| page_size | int | No | 20 | Items per page |

### GET /api/appointments/count - Count Appointments
| Parameter | Type | Required |
|-----------|------|----------|
| status | string | No |

### GET /api/appointments/{appointment_id} - Get Appointment

### POST /api/appointments - Create Appointment
```json
{
  "patient_id": "int (required)",
  "doctor_id": "int (required)",
  "clinic_id": "int (required)",
  "department": "string | null",
  "appointment_date": "date YYYY-MM-DD (required)",
  "appointment_time": "string HH:MM (required)",
  "reason": "string | null"
}
```

### PATCH /api/appointments/{appointment_id}/cancel - Cancel Appointment
```json
{
  "cancel_reason": "string | null"
}
```

### PATCH /api/appointments/{appointment_id}/reschedule - Reschedule Appointment
```json
{
  "appointment_date": "date YYYY-MM-DD (required)",
  "appointment_time": "string HH:MM (required)"
}
```

### PATCH /api/appointments/{appointment_id}/confirm - Confirm Appointment
No body required.

### PATCH /api/appointments/{appointment_id}/complete - Complete Appointment
No body required.

### GET /api/appointments/booked-slots/{doctor_id} - Get Booked Slots
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| date | date (YYYY-MM-DD) | Yes | Date to check |

Returns already-booked time slots for the specified doctor on the given date.

### AppointmentOut Schema
```json
{
  "id": "int",
  "patient_id": "int",
  "doctor_id": "int",
  "clinic_id": "int",
  "department": "string | null",
  "appointment_date": "date",
  "appointment_time": "string",
  "status": "string",
  "reason": "string | null",
  "cancel_reason": "string | null",
  "created_at": "datetime | null",
  "updated_at": "datetime | null",
  "patient_name": "string | null",
  "doctor_name": "string | null",
  "clinic_name": "string | null"
}
```

---

## 6. Dashboard & Statistics (大屏统计)

### GET /api/dashboard/stats - Get Dashboard Stats
**Response**: `DashboardStats`
```json
{
  "total_patients": "int",
  "today_appointments": "int",
  "pending_follow_ups": "int",
  "total_doctors": "int",
  "status_distribution": "object",
  "appointment_trend": "array",
  "recent_follow_ups": "array"
}
```
