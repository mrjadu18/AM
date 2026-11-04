import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import bcrypt from "bcryptjs";
import Admin from "./models/Admin.js";
import Role from "./models/Role.js";
import PlatformSettings from "./models/PlatformSettings.js";
import { DEFAULT_ROLE_TEMPLATES, ALL_PERMISSIONS, } from "./config/permissions.js";
import { ensureUsernameIndex } from "./migrations/ensureUsernameIndex.js";
const bootstrapAdminPassword = env.ADMIN_PASSWORD;
const bootstrapAdmin = async () => {
    try {
        const existingAdmin = await Admin.findOne({
            email: env.ADMIN_EMAIL,
        });
        const superAdminRole = await Role.findOne({
            name: "Super Admin",
        });
        if (!existingAdmin) {
            // Only generate a bcrypt hash and create when account does not exist
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(bootstrapAdminPassword, salt);
            await Admin.create({
                fullName: env.ADMIN_NAME,
                username: "superadmin",
                email: env.ADMIN_EMAIL,
                password: hashedPassword,
                role: "Super Admin",
                roleId: superAdminRole?._id,
                department: "Executive Administration",
                jobTitle: "Super Administrator",
                location: "India",
                bio: "Managing ARDUMUL enterprise company management and platform operations.",
                isActive: true,
                status: "Active",
                mustChangePassword: false,
                permissionGrants: ALL_PERMISSIONS,
                permissionDenials: [],
            });
            console.log("✓ Default Super Admin account created");
            console.log(`  Email: ${env.ADMIN_EMAIL}`);
        }
        else {
            // Preserve existing administrator password — never overwrite existing password on startup.
            // Only ensure role and active status are preserved.
            await Admin.updateOne({ _id: existingAdmin._id }, {
                $set: {
                    username: existingAdmin.username || "superadmin",
                    role: "Super Admin",
                    ...(existingAdmin.roleId || !superAdminRole
                        ? {}
                        : { roleId: superAdminRole._id }),
                    isActive: true,
                    status: "Active",
                    permissionGrants: ALL_PERMISSIONS,
                    permissionDenials: [],
                },
            });
            console.log("✓ Super Admin account verified (existing password preserved)");
            console.log(`  Email: ${env.ADMIN_EMAIL}`);
        }
    }
    catch (error) {
        console.error("Error bootstrapping admin:", error);
        throw error;
    }
};
const bootstrapDefaultRoles = async () => {
    try {
        // 1. Super Admin role
        let superAdminRole = await Role.findOne({
            name: "Super Admin",
        });
        if (!superAdminRole) {
            superAdminRole = await Role.create({
                id: "ROL-001",
                name: "Super Admin",
                description: "Complete unrestricted platform and company management authority.",
                access: "Full Access",
                permissions: ALL_PERMISSIONS,
                status: "Active",
                isSystem: true,
                users: 1,
            });
            console.log("✓ System Super Admin role created");
        }
        // 2. Default standard industry role templates
        let index = 2;
        for (const template of DEFAULT_ROLE_TEMPLATES) {
            const exists = await Role.findOne({
                name: template.name,
            });
            if (!exists) {
                const id = `ROL-${String(index).padStart(3, "0")}`;
                await Role.create({
                    id,
                    name: template.name,
                    description: template.description,
                    access: `${template.name} Access`,
                    permissions: template.permissions,
                    status: "Active",
                    isSystem: false,
                    users: 0,
                });
                console.log(`✓ Seeded role template: ${template.name}`);
            }
            index++;
        }
    }
    catch (error) {
        console.error("Error bootstrapping roles:", error);
        throw error;
    }
};
const bootstrapSettings = async () => {
    try {
        const existingSettings = await PlatformSettings.findOne();
        if (!existingSettings) {
            await PlatformSettings.create({
                storeName: "ARDUMUL",
                supportEmail: "support@ardumul.com",
                commission: 15,
                currency: "INR",
                marketplace: true,
                sellerRegistration: true,
                productApproval: true,
                customerReviews: true,
                gst: true,
            });
            console.log("✓ Default platform settings created");
        }
        else {
            console.log("✓ Platform settings already exist");
        }
    }
    catch (error) {
        console.error("Error bootstrapping settings:", error);
        throw error;
    }
};
const startServer = async () => {
    try {
        await connectDB();
        try {
            await ensureUsernameIndex();
            console.log("✓ Username uniqueness migration verified");
        }
        catch (migrationError) {
            console.error("Username migration warning:", migrationError);
        }
        await bootstrapDefaultRoles();
        await bootstrapAdmin();
        await bootstrapSettings();
        app.listen(env.PORT, () => {
            console.log(`\n✓ ARDUMUL AM Server running on port ${env.PORT}`);
            console.log(`✓ Environment: ${env.NODE_ENV}`);
            console.log(`✓ API: http://localhost:${env.PORT}/api/v1\n`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};
startServer();
