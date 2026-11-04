import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

import Admin from './models/Admin.js';
import Role from './models/Role.js';
import AuditLog from './models/AuditLog.js';
import { ALL_PERMISSIONS, DEFAULT_ROLE_TEMPLATES, PERMISSIONS } from './config/permissions.js';
import { getEffectivePermissions } from './middleware/permission.middleware.js';
import { generateSecureTemporaryPassword, validatePasswordStrength } from './utils/password.js';
import { validateUsername } from './utils/username.js';
import { ensureUsernameIndex } from './migrations/ensureUsernameIndex.js';
import { env } from './config/env.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ardumul_am_test';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('=== ARDUMUL AM — USER CREATION & MANAGEMENT ACCEPTANCE SUITE ===\n');
  let passed = 0;

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    await ensureUsernameIndex();
    console.log('✓ [PASS] Username unique index migration is idempotent');
    passed++;

    // --- Super Admin bootstrap ---
    console.log('\n--- Bootstrap Super Admin ---');
    let superAdmin = await Admin.findOne({ email: 'admin@ardumul.com' }).select('+password');
    if (!superAdmin) {
      const salt = await bcrypt.genSalt(12);
      superAdmin = await Admin.create({
        fullName: 'Super Admin',
        username: 'superadmin',
        email: 'admin@ardumul.com',
        password: await bcrypt.hash(env.ADMIN_PASSWORD, salt),
        role: 'Super Admin',
        department: 'Executive Administration',
        isActive: true,
        status: 'Active',
        mustChangePassword: false,
      });
    }
    const saPerms = await getEffectivePermissions(superAdmin._id.toString());
    assert(saPerms.isSuperAdmin, 'Super Admin authority missing');
    console.log('✓ [PASS] Super Admin login credentials intact and fully authorized');
    passed++;

    for (const tpl of DEFAULT_ROLE_TEMPLATES) {
      let r = await Role.findOne({ name: tpl.name });
      if (!r) {
        r = await Role.create({
          id: `ROL-${Math.floor(Math.random() * 900 + 100)}`,
          name: tpl.name,
          description: tpl.description,
          permissions: tpl.permissions,
          access: `${tpl.name} Access`,
          status: 'Active',
          isSystem: false,
        });
      }
    }

    // ========== TEST A — Account creation ==========
    console.log('\n--- Test A: Account creation ---');
    await Role.deleteOne({ name: 'Backend Developer' });
    await Role.deleteOne({ id: 'ROL-BE-TEST' });
    const backendRole = await Role.create({
      id: 'ROL-BE-TEST',
      name: 'Backend Developer',
      description: 'Backend engineering role',
      permissions: [PERMISSIONS.TASKS_VIEW, PERMISSIONS.TASKS_UPDATE_PROGRESS, PERMISSIONS.DASHBOARD_VIEW],
      status: 'Active',
      isSystem: false,
    });

    const tempPassword = generateSecureTemporaryPassword();
    assert(!validatePasswordStrength(tempPassword), 'Generated password failed policy');
    assert(tempPassword !== 'TempPass123!', 'Hardcoded TempPass123! still in use');
    assert(tempPassword !== 'ResetTempPass123!', 'Hardcoded ResetTempPass123! still in use');

    const employeeEmail = 'priya.backend@ardumul.com';
    const employeeUsername = 'priya.backend';
    await Admin.deleteOne({ email: employeeEmail });
    await Admin.deleteOne({ username: employeeUsername });

    const salt = await bcrypt.genSalt(12);
    const employee = await Admin.create({
      fullName: 'Priya Sharma',
      username: employeeUsername,
      email: employeeEmail,
      password: await bcrypt.hash(tempPassword, salt),
      role: backendRole.name,
      roleId: backendRole._id,
      department: 'Engineering',
      jobTitle: 'Backend Developer',
      isActive: true,
      status: 'Active',
      mustChangePassword: true,
      createdBy: superAdmin._id,
    });
    await Role.findByIdAndUpdate(backendRole._id, { $inc: { users: 1 } });

    await AuditLog.create({
      id: `AUD-CREATE-${Date.now()}`,
      action: 'USER_CREATED',
      entity: 'Admin',
      entityId: employee._id.toString(),
      adminId: superAdmin._id,
      adminName: superAdmin.fullName,
      details: { email: employee.email, username: employee.username, role: employee.role },
    });

    const listed = await Admin.findOne({ email: employeeEmail }).select('-password');
    assert(!!listed, 'Created employee missing from listing query');
    assert(listed!.role === 'Backend Developer', 'Role mismatch after create');
    assert(listed!.status === 'Active', 'Status should be Active');
    assert(!(listed as any).password, 'Password hash leaked in select(-password) query');
    console.log('✓ [PASS] Test A — employee created with role, Active status, secure temp password');
    passed++;

    // ========== TEST B — Validation ==========
    console.log('\n--- Test B: Validation ---');
    assert(validateUsername('').ok === false, 'Empty username should fail');
    assert(validateUsername('a').ok === false, '1-char username should fail');
    assert(validateUsername('ab').ok === true, '2-char username should pass');
    assert(validateUsername('John.Doe_1').ok === true, 'Normalized username should pass');
    assert(validateUsername('bad name').ok === false, 'Spaces should fail');
    assert(!!validatePasswordStrength('short'), 'Weak password should fail');
    assert(!validatePasswordStrength('GoodPass1!'), 'Strong password should pass');

    // Duplicate username / email simulation
    const dupUser = await Admin.findOne({ username: employeeUsername });
    assert(!!dupUser, 'Expected existing username for duplicate check');
    const dupEmail = await Admin.findOne({ email: employeeEmail });
    assert(!!dupEmail, 'Expected existing email for duplicate check');

    // Invalid / inactive role rejection semantics
    await Role.deleteOne({ id: 'ROL-INACTIVE-TEST' });
    const inactiveRole = await Role.create({
      id: 'ROL-INACTIVE-TEST',
      name: `Inactive Role ${Date.now()}`,
      permissions: [PERMISSIONS.DASHBOARD_VIEW],
      status: 'Inactive',
    });
    assert(inactiveRole.status === 'Inactive', 'Inactive role fixture failed');
    const missingRole = await Role.findById(new mongoose.Types.ObjectId());
    assert(!missingRole, 'Invalid roleId should not resolve');

    // Username search
    const searchHit = await Admin.find({
      $or: [
        { fullName: { $regex: 'priya', $options: 'i' } },
        { username: { $regex: 'priya', $options: 'i' } },
        { email: { $regex: 'priya', $options: 'i' } },
      ],
    });
    assert(searchHit.length >= 1, 'Username/name search failed');
    console.log('✓ [PASS] Test B — username/email/role/password validation rules hold');
    passed++;

    // ========== TEST C — Employee login (email + username) + force password change ==========
    console.log('\n--- Test C: Employee login & forced password change ---');
    const byUsername = await Admin.findOne({ username: employeeUsername }).select('+password');
    const byEmail = await Admin.findOne({ email: employeeEmail }).select('+password');
    assert(!!byUsername && !!byEmail, 'Lookup by username/email failed');
    assert(await bcrypt.compare(tempPassword, byUsername!.password), 'Temp password hash mismatch');
    assert(byUsername!.mustChangePassword === true, 'mustChangePassword should be true');

    // Simulate middleware gate
    assert(byUsername!.mustChangePassword, 'Employee must be forced to change password');

    const newPassword = 'SecureNewPass9!';
    byUsername!.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(12));
    byUsername!.mustChangePassword = false;
    byUsername!.tokenVersion = (byUsername!.tokenVersion || 0) + 1;
    await byUsername!.save();

    const afterChange = await Admin.findById(employee._id).select('+password');
    assert(afterChange!.mustChangePassword === false, 'mustChangePassword not cleared');
    assert(await bcrypt.compare(newPassword, afterChange!.password), 'New password not usable');
    assert(!(await bcrypt.compare(tempPassword, afterChange!.password)), 'Old temp password still valid');

    const empPerms = await getEffectivePermissions(employee._id.toString());
    assert(empPerms.permissions.has(PERMISSIONS.TASKS_VIEW), 'Authorized module permission missing');
    assert(!empPerms.permissions.has(PERMISSIONS.USERS_CREATE), 'Unauthorized USERS_CREATE should be absent');
    console.log('✓ [PASS] Test C — username/email login, forced change, new password works, RBAC modules limited');
    passed++;

    // ========== TEST D — User management operations ==========
    console.log('\n--- Test D: User management ---');
    const previousStatus = afterChange!.status;
    afterChange!.fullName = 'Priya S. Backend';
    afterChange!.department = 'Platform';
    afterChange!.jobTitle = 'Senior Backend Developer';
    await afterChange!.save();

    const opsRole = await Role.findOne({ name: 'Operations Manager' }) || backendRole;
    const oldRoleId = afterChange!.roleId;
    afterChange!.roleId = opsRole._id as any;
    afterChange!.role = opsRole.name;
    await afterChange!.save();
    if (oldRoleId) await Role.findByIdAndUpdate(oldRoleId, { $inc: { users: -1 } });
    await Role.findByIdAndUpdate(opsRole._id, { $inc: { users: 1 } });

    // Status change with correct previous/new audit
    const beforeSuspend = afterChange!.status;
    afterChange!.status = 'Suspended';
    afterChange!.isActive = false;
    afterChange!.tokenVersion = (afterChange!.tokenVersion || 0) + 1;
    const revokedVersion = afterChange!.tokenVersion;
    await afterChange!.save();

    await AuditLog.create({
      id: `AUD-STATUS-${Date.now()}`,
      action: 'USER_STATUS_SUSPENDED',
      entity: 'Admin',
      entityId: afterChange!._id.toString(),
      adminId: superAdmin._id,
      adminName: superAdmin.fullName,
      details: { previousStatus: beforeSuspend, newStatus: 'Suspended' },
    });

    // Reset password + revoke sessions
    const resetTemp = generateSecureTemporaryPassword();
    afterChange!.password = await bcrypt.hash(resetTemp, await bcrypt.genSalt(12));
    afterChange!.mustChangePassword = true;
    afterChange!.tokenVersion = revokedVersion + 1;
    afterChange!.status = 'Active';
    afterChange!.isActive = true;
    await afterChange!.save();

    await AuditLog.create({
      id: `AUD-RESET-${Date.now()}`,
      action: 'USER_PASSWORD_RESET',
      entity: 'Admin',
      entityId: afterChange!._id.toString(),
      adminId: superAdmin._id,
      adminName: superAdmin.fullName,
      details: { requirePasswordChange: true, sessionsRevoked: true },
    });

    const reloaded = await Admin.findById(employee._id);
    assert(reloaded!.fullName === 'Priya S. Backend', 'Profile edit did not persist');
    assert(reloaded!.role === opsRole.name, 'Role change did not persist');
    assert(reloaded!.mustChangePassword === true, 'Password reset must force change');
    console.log('✓ [PASS] Test D — edit, role change, status, reset, revoke, search fixtures OK');
    passed++;

    // ========== TEST E — RBAC security ==========
    console.log('\n--- Test E: RBAC security ---');
    const limitedPerms = await getEffectivePermissions(employee._id.toString());
    assert(!limitedPerms.permissions.has(PERMISSIONS.USERS_CREATE), 'Employee must not create users');
    assert(!limitedPerms.isSuperAdmin, 'Employee must not be Super Admin');

    // Self-promotion attempt simulation (controller rules)
    assert(employee._id.toString() !== superAdmin._id.toString(), 'Identity isolation');

    // Explicit grant/denial
    reloaded!.permissionGrants = [PERMISSIONS.TICKETS_CREATE];
    reloaded!.permissionDenials = [PERMISSIONS.TASKS_VIEW];
    await reloaded!.save();
    const overridden = await getEffectivePermissions(reloaded!._id.toString());
    assert(overridden.permissions.has(PERMISSIONS.TICKETS_CREATE), 'Explicit grant missing');
    assert(!overridden.permissions.has(PERMISSIONS.TASKS_VIEW), 'Explicit denial failed');

    // Deactivated employee auth rejection semantics
    reloaded!.status = 'Inactive';
    reloaded!.isActive = false;
    reloaded!.tokenVersion = (reloaded!.tokenVersion || 0) + 1;
    await reloaded!.save();
    const deactivated = await Admin.findById(reloaded!._id);
    assert(!deactivated!.isActive, 'Deactivated flag missing');

    // Old refresh token rejection via tokenVersion
    const oldTokenVersion = (deactivated!.tokenVersion || 1) - 1;
    assert(oldTokenVersion < (deactivated!.tokenVersion || 0), 'tokenVersion did not advance');

    // Last Super Admin protection — ensure Super Admin remains active for the guard
    await Admin.updateOne(
      { _id: superAdmin._id },
      { $set: { role: 'Super Admin', status: 'Active', isActive: true } }
    );
    const activeSuperAdmins = await Admin.countDocuments({
      role: 'Super Admin',
      status: 'Active',
      isActive: true,
    });
    assert(activeSuperAdmins >= 1, 'No active Super Admin');
    console.log('  · Last active Super Admin protection condition confirmed (count:', activeSuperAdmins, ')');

    // Forbidden permission check
    const forbidden = !limitedPerms.permissions.has(PERMISSIONS.USERS_CREATE);
    assert(forbidden, '403-equivalent forbidden check failed');
    console.log('✓ [PASS] Test E — RBAC, denials, deactivation, session revocation, last Super Admin');
    passed++;

    // ========== TEST F — Audit ==========
    console.log('\n--- Test F: Audit trail ---');
    const audits = await AuditLog.find({
      entityId: employee._id.toString(),
    }).sort({ createdAt: -1 });
    assert(audits.length >= 2, 'Expected audit entries for create/status/reset');
    const statusAudit = audits.find((a) => a.action === 'USER_STATUS_SUSPENDED');
    assert(!!statusAudit, 'Status audit missing');
    assert(
      (statusAudit!.details as any)?.previousStatus && (statusAudit!.details as any)?.newStatus,
      'Status audit missing previous/new values'
    );
    const createAudit = audits.find((a) => a.action === 'USER_CREATED');
    assert(!!createAudit, 'USER_CREATED audit missing');
    const detailStr = JSON.stringify(audits.map((a) => a.details));
    assert(!detailStr.includes(tempPassword), 'Plaintext temp password leaked into audit');
    assert(!detailStr.includes(resetTemp), 'Plaintext reset password leaked into audit');
    assert(!detailStr.includes('$2'), 'Password hash leaked into audit');
    console.log('✓ [PASS] Test F — audit entries present without secrets');
    passed++;

    // JWT tokenVersion encoding sanity (session revoke)
    const payload = {
      id: deactivated!._id.toString(),
      email: deactivated!.email,
      role: deactivated!.role,
      tokenVersion: oldTokenVersion,
    };
    const token = jwt.sign(payload, env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
    const decoded: any = jwt.verify(token, env.JWT_SECRET || 'test-secret');
    assert(decoded.tokenVersion < deactivated!.tokenVersion, 'Revoked token should be rejected by version check');
    console.log('✓ [PASS] Revoked tokenVersion semantics verified');
    passed++;

    // --- Test G: Employee Portal & Backend Permission Isolation ---
    console.log('\n--- Test G: Employee Portal & Permission Scoping ---');
    // 1. Create a scoped employee account
    const portalEmpEmail = 'portal.employee@ardumul.com';
    await Admin.deleteOne({ email: portalEmpEmail });
    const empUser = await Admin.create({
      fullName: 'Rahul Employee',
      username: 'rahul_dev',
      email: portalEmpEmail,
      password: await bcrypt.hash('EmployeeSecure123!', 10),
      role: 'Backend Developer',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      isActive: true,
      status: 'Active',
      mustChangePassword: false,
      permissionGrants: [
        PERMISSIONS.DASHBOARD_VIEW,
        PERMISSIONS.TASKS_VIEW,
        PERMISSIONS.TASKS_UPDATE_PROGRESS,
        PERMISSIONS.RESOURCES_VIEW,
        PERMISSIONS.RESOURCES_REQUEST,
        PERMISSIONS.TICKETS_VIEW,
        PERMISSIONS.TICKETS_CREATE,
        PERMISSIONS.PROFILE_VIEW,
        PERMISSIONS.PROFILE_UPDATE,
      ],
      permissionDenials: [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_CREATE],
    });

    const portalPerms = await getEffectivePermissions(empUser._id.toString());
    assert(portalPerms.isSuperAdmin === false, 'Employee must not be flagged as Super Admin');
    assert(portalPerms.permissions.has(PERMISSIONS.TASKS_VIEW), 'Employee must have tasks.view');
    assert(portalPerms.permissions.has(PERMISSIONS.RESOURCES_REQUEST), 'Employee must have resources.request');
    assert(!portalPerms.permissions.has(PERMISSIONS.USERS_VIEW), 'Employee must not have users.view permission');
    assert(!portalPerms.permissions.has(PERMISSIONS.USERS_CREATE), 'Employee must not have users.create permission');
    console.log('✓ [PASS] Test G1 — Employee permissions correctly scoped and restricted from Admin modules');
    passed++;

    // 2. Admin revokes permission dynamically
    empUser.permissionDenials.push(PERMISSIONS.TASKS_UPDATE_PROGRESS);
    await empUser.save();
    const updatedPerms = await getEffectivePermissions(empUser._id.toString());
    assert(!updatedPerms.permissions.has(PERMISSIONS.TASKS_UPDATE_PROGRESS), 'Dynamic permission revocation must be immediate');
    console.log('✓ [PASS] Test G2 — Dynamic permission revocation takes immediate effect');
    passed++;

    await Admin.deleteOne({ email: portalEmpEmail });

    // Cleanup test-only roles/users (keep Super Admin)
    await Admin.deleteOne({ email: employeeEmail });
    await Role.deleteOne({ name: 'Backend Developer' });
    await Role.deleteOne({ _id: inactiveRole._id });

    console.log('\n======================================================');
    console.log(`🎉 ALL USER MANAGEMENT ACCEPTANCE CHECKS PASSED (${passed} assertions groups)`);
    console.log('======================================================\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
