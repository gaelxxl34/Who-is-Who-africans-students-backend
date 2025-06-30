const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { supabaseClient } = require("../config/supabase");
const { JWT_SECRET, JWT_EXPIRY } = require("../config/constants");

// Add a debug function at the top
exports.debugAuth = async (req, res) => {
  try {
    console.log("🔍 Debug Auth - Full Request Admin Object:");
    console.log(JSON.stringify(req.admin, null, 2));

    // Test database connection
    const { data: testUser, error: testError } = await supabaseClient
      .from("users")
      .select(
        `
        *,
        admin_profiles(*)
      `
      )
      .eq("id", req.admin.userId)
      .single();

    console.log("🔍 Direct database query result:");
    console.log("Error:", testError);
    console.log("Data:", JSON.stringify(testUser, null, 2));

    res.json({
      success: true,
      data: {
        requestAdmin: req.admin,
        databaseUser: testUser,
        databaseError: testError,
      },
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get admin dashboard data
exports.getDashboardData = async (req, res) => {
  try {
    // Get system statistics
    const [
      usersCount,
      universitiesCount,
      activeUniversitiesCount,
      studentsCount,
      employersCount,
    ] = await Promise.all([
      supabaseClient.from("users").select("id", { count: "exact", head: true }),
      supabaseClient
        .from("university_profiles")
        .select("id", { count: "exact", head: true }),
      supabaseClient
        .from("university_profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseClient
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("user_type", "student"),
      supabaseClient
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("user_type", "employer"),
    ]);

    // Get recent activity
    const { data: recentActivity } = await supabaseClient
      .from("admin_audit_logs")
      .select(
        `
        action,
        resource_type,
        created_at,
        users!admin_audit_logs_admin_user_id_fkey(
          admin_profiles!inner(first_name, last_name)
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(10);

    // Get recent university registrations
    const { data: recentUniversities } = await supabaseClient
      .from("university_profiles")
      .select("name, country, city, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: usersCount?.count || 0,
          totalStudents: studentsCount?.count || 0,
          totalEmployers: employersCount?.count || 0,
          totalUniversities: universitiesCount?.count || 0,
          activeUniversities: activeUniversitiesCount?.count || 0,
        },
        recentActivity: recentActivity || [],
        recentUniversities: recentUniversities || [],
      },
    });
  } catch (error) {
    console.error("💥 Dashboard data error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard data",
      error: error.message,
    });
  }
};

// Get all users with pagination and filtering - UPDATED to exclude university admins
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, user_type, search } = req.query;
    const offset = (page - 1) * limit;

    console.log(
      `📋 Fetching users - Page: ${page}, Limit: ${limit}, Type: ${user_type}, Search: ${search}`
    );

    // Ensure req.admin exists before proceeding
    if (!req.admin?.userId) {
      console.error("❌ Admin user ID not found in request");
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
        code: "ADMIN_NOT_AUTHENTICATED",
      });
    }

    // Enhanced query with better profile data selection
    // UPDATED: Exclude university_admin users from general user management
    let query = supabaseClient
      .from("users")
      .select(
        `
        id,
        email,
        user_type,
        is_email_verified,
        created_at,
        student_profiles(
          id,
          first_name,
          last_name,
          phone
        ),
        employer_profiles(
          id,
          company_name,
          industry,
          phone,
          country,
          city
        ),
        admin_profiles(
          id,
          first_name,
          last_name,
          phone,
          role,
          permissions,
          is_active,
          last_login
        )
      `,
        { count: "exact" }
      )
      .neq("user_type", "university_admin"); // EXCLUDE university admins

    console.log(
      "🔍 Excluding university_admin users from general user management"
    );

    // Apply filters
    if (user_type && user_type !== "all") {
      // Ensure we don't accidentally include university_admin even if requested
      if (user_type === "university_admin") {
        console.log(
          "❌ university_admin type not allowed in general user management"
        );
        return res.status(400).json({
          success: false,
          message: "University administrators are managed separately",
          code: "INVALID_USER_TYPE_FILTER",
        });
      }
      query = query.eq("user_type", user_type);
      console.log(`🔍 Filtering by user type: ${user_type}`);
    }

    if (search) {
      query = query.ilike("email", `%${search}%`);
      console.log(`🔍 Searching for: ${search}`);
    }

    // Apply pagination
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: users, error, count } = await query;

    if (error) {
      console.error("❌ Error fetching users:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(
      `✅ Successfully fetched ${users?.length || 0} users out of ${
        count || 0
      } total (excluding university admins)`
    );

    // Log admin action safely
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "VIEW_USERS",
        resource_type: "users",
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
      // Don't fail the main request if audit logging fails
    }

    res.json({
      success: true,
      data: {
        users: users || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    console.error("💥 Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

// Get single user by ID for editing
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`👤 Fetching user data for ID: ${userId}`);

    if (!userId) {
      console.log("❌ No user ID provided");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { data: user, error } = await supabaseClient
      .from("users")
      .select(
        `
          *,
          student_profiles(*),
          employer_profiles(*),
          admin_profiles(*)
        `
      )
      .eq("id", userId)
      .single();

    if (error) {
      console.error("❌ Error fetching user by ID:", error);
      throw error;
    }

    if (!user) {
      console.log(`❌ User not found with ID: ${userId}`);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(
      `✅ Successfully fetched user: ${user.email} (${user.user_type})`
    );

    // Prepare user data based on user type
    let userData = {
      id: user.id,
      email: user.email,
      user_type: user.user_type,
      is_email_verified: user.is_email_verified,
      created_at: user.created_at,
    };

    // Add profile-specific data
    switch (user.user_type) {
      case "admin":
        if (user.admin_profiles && user.admin_profiles.length > 0) {
          const adminProfile = user.admin_profiles[0];
          userData.profile = {
            id: adminProfile.id,
            first_name: adminProfile.first_name,
            last_name: adminProfile.last_name,
            phone: adminProfile.phone,
            role: adminProfile.role,
            permissions: adminProfile.permissions,
            last_login: adminProfile.last_login,
            is_active: adminProfile.is_active,
          };
          console.log(
            `📋 Admin profile loaded: ${adminProfile.first_name} ${adminProfile.last_name}`
          );
        }
        break;

      case "student":
        if (user.student_profiles && user.student_profiles.length > 0) {
          const studentProfile = user.student_profiles[0];
          userData.profile = {
            id: studentProfile.id,
            first_name: studentProfile.first_name,
            last_name: studentProfile.last_name,
            phone: studentProfile.phone,
            date_of_birth: studentProfile.date_of_birth,
            gender: studentProfile.gender,
            country: studentProfile.country,
            city: studentProfile.city,
            address: studentProfile.address,
            university_id: studentProfile.university_id,
            student_id: studentProfile.student_id,
            year_of_study: studentProfile.year_of_study,
            field_of_study: studentProfile.field_of_study,
            graduation_year: studentProfile.graduation_year,
          };
          console.log(
            `📋 Student profile loaded: ${studentProfile.first_name} ${studentProfile.last_name}`
          );
        }
        break;

      case "employer":
        if (user.employer_profiles && user.employer_profiles.length > 0) {
          const employerProfile = user.employer_profiles[0];
          userData.profile = {
            id: employerProfile.id,
            first_name: employerProfile.first_name,
            last_name: employerProfile.last_name,
            phone: employerProfile.phone,
            company_name: employerProfile.company_name,
            job_title: employerProfile.job_title,
            country: employerProfile.country,
            city: employerProfile.city,
            address: employerProfile.address,
            industry: employerProfile.industry,
            company_size: employerProfile.company_size,
            website: employerProfile.website,
          };
          console.log(
            `📋 Employer profile loaded: ${employerProfile.first_name} ${employerProfile.last_name} at ${employerProfile.company_name}`
          );
        }
        break;

      default:
        console.log(`⚠️ Unknown user type: ${user.user_type}`);
    }

    // Log admin action
    await supabaseClient.from("admin_audit_logs").insert({
      admin_user_id: req.admin.userId,
      action: "VIEW_USER_DETAILS",
      resource_type: "users",
      resource_id: userId,
      ip_address: req.ip,
      user_agent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("💥 Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user data",
      error: error.message,
    });
  }
};

// Create university profile - UPDATED to not require user_id
exports.createUniversity = async (req, res) => {
  try {
    console.log("🏛️ Creating new university profile");

    const {
      // University basic information
      name,
      short_name,
      email,
      phone,
      country,
      city,
      address,
      website,
      logo_url,
      registration_number,
      accreditation_body,
    } = req.body;

    // Validate required fields
    const missingFields = [];
    if (!name?.trim()) missingFields.push("University name");
    if (!email?.trim()) missingFields.push("University email");
    if (!country?.trim()) missingFields.push("Country");
    if (!city?.trim()) missingFields.push("City");

    if (missingFields.length > 0) {
      console.log("❌ Missing required fields:", missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
        code: "INVALID_EMAIL",
      });
    }

    // Check if university with this email already exists
    const { data: existingUniversity, error: checkError } = await supabaseClient
      .from("university_profiles")
      .select("id, name")
      .eq("email", email.trim())
      .maybeSingle();

    if (checkError) {
      console.error("❌ Error checking existing university:", checkError);
      // Don't fail here, just log the error
    }

    if (existingUniversity) {
      return res.status(400).json({
        success: false,
        message: `A university with this email already exists: ${existingUniversity.name}`,
        code: "UNIVERSITY_EXISTS",
      });
    }

    // Create university profile directly WITHOUT user_id
    const universityProfileData = {
      name: name.trim(),
      short_name: short_name?.trim() || null,
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      country: country.trim(),
      city: city.trim(),
      address: address?.trim() || null,
      website: website?.trim() || null,
      logo_url: logo_url?.trim() || null,
      registration_number: registration_number?.trim() || null,
      accreditation_body: accreditation_body?.trim() || null,
      created_by: req.admin.userId,
      is_active: true,
      is_verified: false,
    };

    console.log("📋 Creating university with data:", {
      ...universityProfileData,
      created_by: "admin_user_id",
    });

    const { data: universityProfile, error: profileError } =
      await supabaseClient
        .from("university_profiles")
        .insert(universityProfileData)
        .select()
        .single();

    if (profileError) {
      console.error("❌ Error creating university profile:", profileError);

      // Provide specific error messages based on error code
      if (profileError.code === "23505") {
        return res.status(400).json({
          success: false,
          message:
            "A university with this email or registration number already exists",
          code: "DUPLICATE_UNIVERSITY",
        });
      }

      throw new Error(
        `Failed to create university profile: ${profileError.message}`
      );
    }

    console.log(
      "✅ University profile created successfully:",
      universityProfile.id
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "CREATE_UNIVERSITY",
        resource_type: "university_profile",
        resource_id: universityProfile.id,
        new_values: {
          university_name: name,
          university_email: email,
          country,
          city,
        },
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.status(201).json({
      success: true,
      message: "University created successfully",
      data: {
        university: universityProfile,
      },
    });
  } catch (error) {
    console.error("💥 Create university error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create university",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

// Get single university by ID - UPDATED for disconnected model
exports.getUniversityById = async (req, res) => {
  try {
    const { universityId } = req.params;

    console.log(`🏛️ Fetching university data for ID: ${universityId}`);

    if (!universityId) {
      console.log("❌ No university ID provided");
      return res.status(400).json({
        success: false,
        message: "University ID is required",
      });
    }

    const { data: university, error } = await supabaseClient
      .from("university_profiles")
      .select("*")
      .eq("id", universityId)
      .single();

    if (error) {
      console.error("❌ Error fetching university by ID:", error);
      throw error;
    }

    if (!university) {
      console.log(`❌ University not found with ID: ${universityId}`);
      return res.status(404).json({
        success: false,
        message: "University not found",
      });
    }

    console.log(`✅ Successfully fetched university: ${university.name}`);

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "VIEW_UNIVERSITY_DETAILS",
        resource_type: "university_profile",
        resource_id: universityId,
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      data: university,
    });
  } catch (error) {
    console.error("💥 Get university by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch university data",
      error: error.message,
    });
  }
};

// Update university profile
exports.updateUniversity = async (req, res) => {
  try {
    const { universityId } = req.params;
    const updateData = req.body;

    console.log(`✏️ Updating university data for ID: ${universityId}`);
    console.log(`📋 Update data received:`, updateData);

    if (!universityId) {
      console.log("❌ No university ID provided");
      return res.status(400).json({
        success: false,
        message: "University ID is required",
      });
    }

    // Validate required fields if they're being updated
    if (updateData.name !== undefined && !updateData.name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "University name cannot be empty",
      });
    }

    // Remove undefined/null values and prepare update data
    const cleanUpdateData = {};
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        if (typeof updateData[key] === "string") {
          cleanUpdateData[key] = updateData[key].trim();
        } else {
          cleanUpdateData[key] = updateData[key];
        }
      }
    });

    // Add updated timestamp
    cleanUpdateData.updated_at = new Date().toISOString();

    console.log(`📋 Cleaned update data:`, cleanUpdateData);

    const { data: updatedUniversity, error: updateError } = await supabaseClient
      .from("university_profiles")
      .update(cleanUpdateData)
      .eq("id", universityId)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error updating university:", updateError);
      throw updateError;
    }

    console.log(
      `✅ University updated successfully: ${updatedUniversity.name}`
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "UPDATE_UNIVERSITY",
        resource_type: "university_profile",
        resource_id: universityId,
        new_values: cleanUpdateData,
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      message: "University updated successfully",
      data: updatedUniversity,
    });
  } catch (error) {
    console.error("💥 Update university error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update university",
      error: error.message,
    });
  }
};

// Delete university
exports.deleteUniversity = async (req, res) => {
  try {
    const { universityId } = req.params;

    console.log(`🗑️ Deleting university with ID: ${universityId}`);

    if (!universityId) {
      return res.status(400).json({
        success: false,
        message: "University ID is required",
      });
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(universityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid university ID format",
      });
    }

    // First get university details for logging
    const { data: university, error: fetchError } = await supabaseClient
      .from("university_profiles")
      .select("id, name, email")
      .eq("id", universityId)
      .single();

    if (fetchError || !university) {
      console.log(`❌ University not found: ${universityId}`, fetchError);
      return res.status(404).json({
        success: false,
        message: "University not found",
      });
    }

    // Check if university has any related data that should prevent deletion
    const { data: relatedAdmins, error: adminCheckError } = await supabaseClient
      .from("university_admin_profiles")
      .select("id")
      .eq("university_id", universityId)
      .limit(1);

    if (adminCheckError) {
      console.warn(
        "⚠️ Could not check for related admins:",
        adminCheckError.message
      );
    }

    if (relatedAdmins && relatedAdmins.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete university with existing administrators. Please remove all administrators first.",
        code: "UNIVERSITY_HAS_ADMINS",
      });
    }

    // Delete university profile
    const { error: deleteError } = await supabaseClient
      .from("university_profiles")
      .delete()
      .eq("id", universityId);

    if (deleteError) {
      console.error("❌ Error deleting university:", deleteError);
      throw deleteError;
    }

    console.log(`✅ University deleted successfully: ${university.name}`);

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "DELETE_UNIVERSITY",
        resource_type: "university_profile",
        resource_id: universityId,
        old_values: {
          name: university.name,
          email: university.email,
        },
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      message: "University deleted successfully",
      data: {
        deletedUniversity: {
          id: university.id,
          name: university.name,
        },
      },
    });
  } catch (error) {
    console.error("💥 Delete university error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete university",
      error: error.message,
    });
  }
};

// Update user profile data - FIX SYNTAX ERROR
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    console.log(`✏️ Updating user data for ID: ${userId}`);
    console.log(`📋 Update data received:`, updateData);

    if (!userId) {
      console.log("❌ No user ID provided");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // First, get the user to determine their type
    const { data: user, error: userError } = await supabaseClient
      .from("users")
      .select("id, email, user_type")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      console.log(`❌ User not found with ID: ${userId}`, userError);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`📋 Found user: ${user.email} (${user.user_type})`);

    let updatedProfile = null;
    const profileData = updateData.profile || {};

    // Remove undefined/null values
    Object.keys(profileData).forEach((key) => {
      if (profileData[key] === undefined || profileData[key] === null) {
        delete profileData[key];
      }
    });

    console.log(`📋 Cleaned profile data:`, profileData);

    // Update profile based on user type
    switch (user.user_type) {
      case "admin":
        const adminUpdateData = {
          ...(profileData.first_name !== undefined && {
            first_name: profileData.first_name,
          }),
          ...(profileData.last_name !== undefined && {
            last_name: profileData.last_name,
          }),
          ...(profileData.phone !== undefined && { phone: profileData.phone }),
          updated_at: new Date().toISOString(),
        };

        console.log(`📋 Admin update data:`, adminUpdateData);

        const { data: updatedAdmin, error: adminError } = await supabaseClient
          .from("admin_profiles")
          .update(adminUpdateData)
          .eq("user_id", userId)
          .select()
          .single();

        if (adminError) {
          console.error("❌ Error updating admin profile:", adminError);
          throw adminError;
        }

        updatedProfile = updatedAdmin;
        console.log(
          `✅ Admin profile updated: ${updatedAdmin.first_name} ${updatedAdmin.last_name}`
        );
        break;

      case "student":
        const studentUpdateData = {
          ...(profileData.first_name !== undefined && {
            first_name: profileData.first_name,
          }),
          ...(profileData.last_name !== undefined && {
            last_name: profileData.last_name,
          }),
          ...(profileData.phone !== undefined && { phone: profileData.phone }),
          updated_at: new Date().toISOString(),
        };

        console.log(`📋 Student update data:`, studentUpdateData);

        const { data: updatedStudent, error: studentError } =
          await supabaseClient
            .from("student_profiles")
            .update(studentUpdateData)
            .eq("user_id", userId)
            .select()
            .single();

        if (studentError) {
          console.error("❌ Error updating student profile:", studentError);
          throw studentError;
        }

        updatedProfile = updatedStudent;
        console.log(
          `✅ Student profile updated: ${updatedStudent.first_name} ${updatedStudent.last_name}`
        );
        break;

      case "employer":
        const employerUpdateData = {
          ...(profileData.company_name !== undefined && {
            company_name: profileData.company_name,
          }),
          ...(profileData.industry !== undefined && {
            industry: profileData.industry,
          }),
          ...(profileData.phone !== undefined && { phone: profileData.phone }),
          ...(profileData.country !== undefined && {
            country: profileData.country,
          }),
          ...(profileData.city !== undefined && { city: profileData.city }),
          updated_at: new Date().toISOString(),
        };

        console.log(`📋 Employer update data:`, employerUpdateData);

        const { data: updatedEmployer, error: employerError } =
          await supabaseClient
            .from("employer_profiles")
            .update(employerUpdateData)
            .eq("user_id", userId)
            .select()
            .single();

        if (employerError) {
          console.error("❌ Error updating employer profile:", employerError);
          throw employerError;
        }

        updatedProfile = updatedEmployer;
        console.log(
          `✅ Employer profile updated: ${updatedEmployer.company_name}`
        );
        break;

      default:
        console.log(`⚠️ Unknown user type: ${user.user_type}`);
        return res.status(400).json({
          success: false,
          message: "Invalid user type",
        });
    }

    // Update user email if changed
    if (updateData.email && updateData.email !== user.email) {
      console.log(
        `📧 Updating user email from ${user.email} to ${updateData.email}`
      );
      const { error: emailUpdateError } = await supabaseClient
        .from("users")
        .update({ email: updateData.email })
        .eq("id", userId);

      if (emailUpdateError) {
        console.error("❌ Error updating user email:", emailUpdateError);
        // Don't throw error, just log it
      }
    }

    // Log admin action
    await supabaseClient.from("admin_audit_logs").insert({
      admin_user_id: req.admin.userId,
      action: "UPDATE_USER",
      resource_type: "users",
      resource_id: userId,
      new_values: {
        profile: updatedProfile,
        ...updateData,
      },
      ip_address: req.ip,
      user_agent: req.get("User-Agent"),
    });

    console.log(`✅ User update completed successfully`);

    res.json({
      success: true,
      message: "User updated successfully",
      data: {
        id: user.id,
        email: updateData.email || user.email,
        user_type: user.user_type,
        is_email_verified: user.is_email_verified,
        profile: updatedProfile,
      },
    });
  } catch (error) {
    console.error("💥 Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
};

// Admin logout
exports.adminLogout = async (req, res) => {
  try {
    // Log logout action
    await supabaseClient.from("admin_audit_logs").insert({
      admin_user_id: req.admin.userId,
      action: "LOGOUT",
      resource_type: "admin_session",
      ip_address: req.ip,
      user_agent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("💥 Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
};

// Get all universities with pagination and filtering - UPDATED for disconnected model
exports.getUniversities = async (req, res) => {
  try {
    const { page = 1, limit = 20, country, search, is_active } = req.query;
    const offset = (page - 1) * limit;

    console.log(
      `🏛️ Fetching universities - Page: ${page}, Limit: ${limit}, Country: ${country}, Search: ${search}, Active: ${is_active}`
    );

    // Ensure req.admin exists before proceeding
    if (!req.admin?.userId) {
      console.error("❌ Admin user ID not found in request");
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
        code: "ADMIN_NOT_AUTHENTICATED",
      });
    }

    // Build query with updated fields (no more join to users table)
    let query = supabaseClient.from("university_profiles").select(
      `
        id,
        name,
        short_name,
        email,
        phone,
        country,
        city,
        address,
        website,
        logo_url,
        is_active,
        is_verified,
        registration_number,
        accreditation_body,
        created_at,
        updated_at
      `,
      { count: "exact" }
    );

    // Apply filters
    if (country && country !== "all") {
      query = query.eq("country", country);
      console.log(`🔍 Filtering by country: ${country}`);
    }

    if (is_active !== undefined && is_active !== "all") {
      query = query.eq("is_active", is_active === "true");
      console.log(`🔍 Filtering by active status: ${is_active}`);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,short_name.ilike.%${search}%,email.ilike.%${search}%`
      );
      console.log(`🔍 Searching for: ${search}`);
    }

    // Apply pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: universities, error, count } = await query;

    if (error) {
      console.error("❌ Error fetching universities:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(
      `✅ Successfully fetched ${
        universities?.length || 0
      } universities out of ${count || 0} total`
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "VIEW_UNIVERSITIES",
        resource_type: "university_profiles",
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      data: {
        universities: universities || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    console.error("💥 Get universities error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch universities",
      error: error.message,
    });
  }
};

// Update university status (activate/deactivate)
exports.updateUniversityStatus = async (req, res) => {
  try {
    const { universityId } = req.params;
    const { is_active } = req.body;

    console.log(
      `🔄 Updating university status for ID: ${universityId} - Active: ${is_active}`
    );

    if (!universityId) {
      return res.status(400).json({
        success: false,
        message: "University ID is required",
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active must be a boolean value",
      });
    }

    // Update university status
    const { data: updatedUniversity, error } = await supabaseClient
      .from("university_profiles")
      .update({
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", universityId)
      .select()
      .single();

    if (error) {
      console.error("❌ Error updating university status:", error);
      throw error;
    }

    if (!updatedUniversity) {
      return res.status(404).json({
        success: false,
        message: "University not found",
      });
    }

    console.log(
      `✅ University status updated: ${updatedUniversity.name} is now ${
        is_active ? "active" : "inactive"
      }`
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "UPDATE_UNIVERSITY_STATUS",
        resource_type: "university_profile",
        resource_id: universityId,
        new_values: { is_active },
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      message: `University ${
        is_active ? "activated" : "deactivated"
      } successfully`,
      data: updatedUniversity,
    });
  } catch (error) {
    console.error("💥 Update university status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update university status",
      error: error.message,
    });
  }
};

// University Admin Management Functions

// Get all university administrators with pagination
exports.getUniversityAdmins = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      university_id,
      search,
      is_active,
    } = req.query;
    const offset = (page - 1) * limit;

    console.log(
      `🎓 Fetching university admins - Page: ${page}, Limit: ${limit}, University: ${university_id}, Search: ${search}, Active: ${is_active}`
    );

    // Ensure req.admin exists before proceeding
    if (!req.admin?.userId) {
      console.error("❌ Admin user ID not found in request");
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
        code: "ADMIN_NOT_AUTHENTICATED",
      });
    }

    // Use the university_admin_view for easy querying
    let query = supabaseClient
      .from("university_admin_view")
      .select("*", { count: "exact" });

    // Apply filters
    if (university_id && university_id !== "all") {
      query = query.eq("university_id", university_id);
      console.log(`🔍 Filtering by university: ${university_id}`);
    }

    if (is_active !== undefined && is_active !== "all") {
      query = query.eq("is_active", is_active === "true");
      console.log(`🔍 Filtering by active status: ${is_active}`);
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,university_name.ilike.%${search}%`
      );
      console.log(`🔍 Searching for: ${search}`);
    }

    // Apply pagination and ordering
    query = query
      .order("admin_created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: universityAdmins, error, count } = await query;

    if (error) {
      console.error("❌ Error fetching university admins:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(
      `✅ Successfully fetched ${
        universityAdmins?.length || 0
      } university admins out of ${count || 0} total`
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "VIEW_UNIVERSITY_ADMINS",
        resource_type: "university_admin_profiles",
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      data: {
        universityAdmins: universityAdmins || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    console.error("💥 Get university admins error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch university administrators",
      error: error.message,
    });
  }
};

// Get university admin by ID
exports.getUniversityAdminById = async (req, res) => {
  try {
    const { adminId } = req.params;

    console.log(`👤 Fetching university admin data for ID: ${adminId}`);

    if (!adminId) {
      console.log("❌ No admin ID provided");
      return res.status(400).json({
        success: false,
        message: "University admin ID is required",
      });
    }

    const { data: universityAdmin, error } = await supabaseClient
      .from("university_admin_view")
      .select("*")
      .eq("admin_id", adminId)
      .single();

    if (error) {
      console.error("❌ Error fetching university admin by ID:", error);
      throw error;
    }

    if (!universityAdmin) {
      console.log(`❌ University admin not found with ID: ${adminId}`);
      return res.status(404).json({
        success: false,
        message: "University administrator not found",
      });
    }

    console.log(
      `✅ Successfully fetched university admin: ${universityAdmin.first_name} ${universityAdmin.last_name}`
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "VIEW_UNIVERSITY_ADMIN_DETAILS",
        resource_type: "university_admin_profiles",
        resource_id: adminId,
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      data: universityAdmin,
    });
  } catch (error) {
    console.error("💥 Get university admin by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch university administrator data",
      error: error.message,
    });
  }
};

// Create university administrator - UPDATED to use Supabase Auth instead of password hash
exports.createUniversityAdmin = async (req, res) => {
  try {
    console.log("🎓 Creating new university administrator with Supabase Auth");

    const {
      email,
      password,
      university_id,
      first_name,
      last_name,
      title,
      phone,
      role = "university_admin",
      permissions = [
        "university:read",
        "university:write",
        "students:read",
        "students:write",
        "courses:read",
        "courses:write",
        "transcripts:read",
        "transcripts:write",
        "certificates:read",
        "certificates:write",
      ],
    } = req.body;

    // Validate required fields
    const missingFields = [];
    if (!email?.trim()) missingFields.push("Email");
    if (!password?.trim()) missingFields.push("Password");
    if (!university_id?.trim()) missingFields.push("University ID");
    if (!first_name?.trim()) missingFields.push("First name");
    if (!last_name?.trim()) missingFields.push("Last name");

    if (missingFields.length > 0) {
      console.log("❌ Missing required fields:", missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
        code: "WEAK_PASSWORD",
      });
    }

    // Check if university exists
    const { data: university, error: universityError } = await supabaseClient
      .from("university_profiles")
      .select("id, name")
      .eq("id", university_id)
      .single();

    if (universityError || !university) {
      console.error("❌ University not found:", university_id, universityError);
      return res.status(400).json({
        success: false,
        message: "University not found",
        code: "UNIVERSITY_NOT_FOUND",
      });
    }

    const { supabaseAdmin } = require("../config/supabase");

    if (!supabaseAdmin) {
      console.error("❌ CRITICAL: Supabase admin client not available");
      return res.status(500).json({
        success: false,
        message:
          "Server configuration error: Cannot create users in authentication system",
        code: "AUTH_SERVICE_UNAVAILABLE",
        details: "Service role key is missing or invalid",
      });
    }

    console.log("🔐 Creating university admin user in Supabase Auth system...");

    // Create user in Supabase Auth
    let authUser;
    try {
      const authResponse = await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: password,
        email_confirm: true,
        user_metadata: {
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          user_type: "university_admin",
          university_id: university_id,
          role: role,
          created_by_admin: true,
        },
      });

      authUser = authResponse.data;
      const authError = authResponse.error;

      if (authError) {
        console.error("❌ Supabase Auth creation error:", authError);
        return res.status(500).json({
          success: false,
          message: `Authentication user creation failed: ${authError.message}`,
          code: "AUTH_USER_CREATION_FAILED",
        });
      }

      if (!authUser?.user?.id) {
        console.error("❌ No user ID returned from Supabase Auth");
        return res.status(500).json({
          success: false,
          message: "Authentication user creation failed: No user ID returned",
          code: "AUTH_USER_ID_MISSING",
        });
      }

      console.log(
        "✅ Supabase Auth user created successfully:",
        authUser.user.id
      );
    } catch (authException) {
      console.error("❌ Auth creation exception:", authException);
      return res.status(500).json({
        success: false,
        message: "Failed to create authentication user",
        code: "AUTH_CREATION_EXCEPTION",
        details: authException.message,
      });
    }

    // Step 2: Create user record in your custom users table
    const userData = {
      id: authUser.user.id, // Use the same ID from Supabase Auth
      email: authUser.user.email,
      user_type: "university_admin",
      is_email_verified: true, // Since we auto-confirmed
      auth_managed: true,
    };

    console.log("📋 Creating user record with data:", userData);

    const { data: user, error: userError } = await supabaseClient
      .from("users")
      .insert(userData)
      .select("*")
      .single();

    if (userError) {
      console.error("❌ Error creating user record:", userError);

      // Cleanup: Delete the auth user if database record creation fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        console.log("🧹 Cleaned up auth user after database error");
      } catch (cleanupError) {
        console.error("❌ Failed to cleanup auth user:", cleanupError);
      }

      return res.status(500).json({
        success: false,
        message: `Failed to create user record: ${userError.message}`,
        code: "USER_RECORD_CREATION_FAILED",
      });
    }

    console.log("✅ User record created successfully:", user.id, user.email);

    // Step 3: Create university admin profile (NO password_hash since using Supabase Auth)
    const adminProfileData = {
      user_id: user.id,
      university_id: university_id.trim(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      title: title?.trim() || null,
      phone: phone?.trim() || null,
      role: role,
      permissions: Array.isArray(permissions) ? permissions : [],
      is_active: true,
      email: user.email, // Add email for easier lookups
      // NO password_hash - using Supabase Auth instead
    };

    console.log(
      "📋 Creating university admin profile with data:",
      adminProfileData
    );

    const { data: adminProfile, error: profileError } = await supabaseClient
      .from("university_admin_profiles")
      .insert(adminProfileData)
      .select("*")
      .single();

    if (profileError) {
      console.error(
        "❌ Error creating university admin profile:",
        profileError
      );

      // Cleanup: Delete both auth user and database user
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        await supabaseClient.from("users").delete().eq("id", user.id);
        console.log("🧹 Cleaned up auth user and database user after profile error");
      } catch (cleanupError) {
        console.error("❌ Failed to cleanup after profile error:", cleanupError);
      }

      return res.status(500).json({
        success: false,
        message: `Failed to create university admin profile: ${profileError.message}`,
        code: "PROFILE_CREATION_FAILED",
      });
    }

    console.log(
      "✅ University admin profile created successfully:",
      adminProfile.id
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "CREATE_UNIVERSITY_ADMIN",
        resource_type: "university_admin_profile",
        resource_id: adminProfile.id,
        new_values: {
          university_name: university.name,
          admin_email: user.email,
          admin_name: `${first_name} ${last_name}`,
          role: role,
          permissions: permissions,
          supabase_auth_id: authUser.user.id,
          auth_method: "supabase_auth",
        },
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.status(201).json({
      success: true,
      message:
        "University administrator created successfully with Supabase authentication",
      data: {
        auth: {
          id: authUser.user.id,
          email: authUser.user.email,
          email_confirmed: authUser.user.email_confirmed_at !== null,
        },
        user: {
          id: user.id,
          email: user.email,
          user_type: user.user_type,
          is_email_verified: user.is_email_verified,
          created_at: user.created_at,
        },
        profile: {
          ...adminProfile,
          password_hash: undefined, // Don't return any password data
        },
        university: university,
      },
    });
  } catch (error) {
    console.error("💥 Create university admin error:", error);
    console.error("💥 Full error stack:", error.stack);

    res.status(500).json({
      success: false,
      message: "Failed to create university administrator",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// Update university administrator
exports.updateUniversityAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const updateData = req.body;

    console.log(`✏️ Updating university admin data for ID: ${adminId}`);
    console.log(`📋 Update data received:`, updateData);

    if (!adminId) {
      console.log("❌ No admin ID provided");
      return res.status(400).json({
        success: false,
        message: "University admin ID is required",
      });
    }

    // Validate required fields if they're being updated
    if (updateData.first_name !== undefined && !updateData.first_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "First name cannot be empty",
      });
    }

    if (updateData.last_name !== undefined && !updateData.last_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Last name cannot be empty",
      });
    }

    // Remove undefined/null values and prepare update data
    const cleanUpdateData = {};
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        if (typeof updateData[key] === "string") {
          cleanUpdateData[key] = updateData[key].trim();
        } else {
          cleanUpdateData[key] = updateData[key];
        }
      }
    });

    // Add updated timestamp
    cleanUpdateData.updated_at = new Date().toISOString();

    console.log(`📋 Cleaned update data:`, cleanUpdateData);

    const { data: updatedAdmin, error: updateError } = await supabaseClient
      .from("university_admin_profiles")
      .update(cleanUpdateData)
      .eq("id", adminId)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error updating university admin:", updateError);
      throw updateError;
    }

    console.log(
      `✅ University admin updated successfully: ${updatedAdmin.first_name} ${updatedAdmin.last_name}`
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "UPDATE_UNIVERSITY_ADMIN",
        resource_type: "university_admin_profiles",
        resource_id: adminId,
        new_values: cleanUpdateData,
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      message: "University administrator updated successfully",
      data: updatedAdmin,
    });
  } catch (error) {
    console.error("💥 Update university admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update university administrator",
      error: error.message,
    });
  }
};

// Delete university administrator
exports.deleteUniversityAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    console.log(`🗑️ Deleting university admin with ID: ${adminId}`);

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "University admin ID is required",
      });
    }

    // First get admin details for logging and cleanup
    const { data: admin, error: fetchError } = await supabaseClient
      .from("university_admin_profiles")
      .select("first_name, last_name, user_id, email")
      .eq("id", adminId)
      .single();

    if (fetchError || !admin) {
      return res.status(404).json({
        success: false,
        message: "University administrator not found",
      });
    }

    // Delete from Supabase Auth first (if admin client available)
    const { supabaseAdmin } = require("../config/supabase");
    if (supabaseAdmin && admin.user_id) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(admin.user_id);
        console.log("✅ Deleted user from Supabase Auth");
      } catch (authError) {
        console.warn(
          "⚠️ Failed to delete from Supabase Auth:",
          authError.message
        );
        // Don't fail the operation if auth deletion fails
      }
    }

    // Delete university admin profile
    const { error: deleteError } = await supabaseClient
      .from("university_admin_profiles")
      .delete()
      .eq("id", adminId);

    if (deleteError) {
      console.error("❌ Error deleting university admin profile:", deleteError);
      throw deleteError;
    }

    // Delete the associated user record
    const { error: userDeleteError } = await supabaseClient
      .from("users")
      .delete()
      .eq("id", admin.user_id);

    if (userDeleteError) {
      console.warn("⚠️ Error deleting user record:", userDeleteError);
      // Don't fail the operation as admin profile is already deleted
    }

    console.log(
      `✅ University admin deleted successfully: ${admin.first_name} ${admin.last_name}`
    );

    // Log admin action
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "DELETE_UNIVERSITY_ADMIN",
        resource_type: "university_admin_profiles",
        resource_id: adminId,
        old_values: {
          name: `${admin.first_name} ${admin.last_name}`,
          email: admin.email,
          deleted_from_auth: !!supabaseAdmin,
        },
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log admin action:", auditError.message);
    }

    res.json({
      success: true,
      message:
        "University administrator deleted successfully from both database and authentication",
    });
  } catch (error) {
    console.error("💥 Delete university admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete university administrator",
      error: error.message,
    });
  }
};

// Get universities for dropdown
exports.getUniversitiesForDropdown = async (req, res) => {
  try {
    console.log("📋 Fetching universities for dropdown");

    // Ensure req.admin exists before proceeding
    if (!req.admin?.userId) {
      console.error("❌ Admin user ID not found in request");
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
        code: "ADMIN_NOT_AUTHENTICATED",
      });
    }

    // Get active universities only with minimal data needed for dropdown
    const { data: universities, error } = await supabaseClient
      .from("university_profiles")
      .select("id, name, short_name, country, city, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("❌ Error fetching universities for dropdown:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(
      `✅ Successfully fetched ${
        universities?.length || 0
      } universities for dropdown`
    );

    res.json({
      success: true,
      data: universities || [],
    });
  } catch (error) {
    console.error("💥 Get universities for dropdown error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch universities",
      error: error.message,
    });
  }
};

// Complete user deletion function - FIXED
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`🗑️ Starting complete deletion process for user ID: ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
        code: "MISSING_USER_ID",
      });
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
        code: "INVALID_USER_ID_FORMAT",
      });
    }

    // Step 1: Get user details for validation and logging - FIXED QUERY
    console.log("📋 Step 1: Fetching user details...");
    const { data: user, error: fetchError } = await supabaseClient
      .from("users")
      .select(
        `
        id,
        email,
        user_type,
        auth_managed,
        created_at,
        student_profiles(id, first_name, last_name),
        employer_profiles(id, company_name),
        admin_profiles(id, first_name, last_name, role)
      `
      )
      .eq("id", userId)
      .single();

    if (fetchError || !user) {
      console.log(`❌ User not found: ${userId}`, fetchError);
      return res.status(404).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    console.log(`📋 Found user: ${user.email} (${user.user_type})`);

    // Prevent deletion of university admins through this endpoint
    if (user.user_type === "university_admin") {
      console.log(
        "❌ Attempted to delete university admin through general user deletion"
      );
      return res.status(403).json({
        success: false,
        message:
          "University administrators must be deleted through the University Admin Management section",
        code: "UNIVERSITY_ADMIN_DELETE_FORBIDDEN",
      });
    }

    // Prevent self-deletion
    if (user.id === req.admin?.userId) {
      console.log("❌ Admin attempted to delete their own account");
      return res.status(403).json({
        success: false,
        message: "You cannot delete your own admin account",
        code: "SELF_DELETE_FORBIDDEN",
      });
    }

    // Get user display name for logging - FIXED to use correct profile structure
    let userDisplayName = user.email;
    if (user.user_type === "student" && user.student_profiles?.[0]) {
      const profile = user.student_profiles[0];
      userDisplayName =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        user.email;
    } else if (user.user_type === "employer" && user.employer_profiles?.[0]) {
      const profile = user.employer_profiles[0];
      userDisplayName = profile.company_name || user.email;
    } else if (user.user_type === "admin" && user.admin_profiles?.[0]) {
      const profile = user.admin_profiles[0];
      userDisplayName =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        user.email;
    }

    console.log(`📋 User display name: ${userDisplayName}`);

    const deletionResults = {
      auth_deleted: false,
      profile_deleted: false,
      audit_logs_deleted: false,
      user_deleted: false,
      errors: [],
    };

    // Step 2: Delete from Supabase Auth (if auth managed)
    if (user.auth_managed) {
      console.log("🔐 Step 2: Deleting from Supabase Auth...");
      const { supabaseAdmin } = require("../config/supabase");

      if (supabaseAdmin) {
        try {
          const { error: authDeleteError } =
            await supabaseAdmin.auth.admin.deleteUser(user.id);

          if (authDeleteError) {
            console.warn(
              "⚠️ Failed to delete from Supabase Auth:",
              authDeleteError.message
            );
            deletionResults.errors.push(
              `Auth deletion warning: ${authDeleteError.message}`
            );
          } else {
            console.log("✅ Successfully deleted from Supabase Auth");
            deletionResults.auth_deleted = true;
          }
        } catch (authError) {
          console.warn(
            "⚠️ Exception during Supabase Auth deletion:",
            authError.message
          );
          deletionResults.errors.push(
            `Auth deletion exception: ${authError.message}`
          );
        }
      } else {
        console.warn(
          "⚠️ Supabase Admin client not available, skipping auth deletion"
        );
        deletionResults.errors.push(
          "Supabase Admin client not available for auth deletion"
        );
      }
    } else {
      console.log(
        "ℹ️ User is not auth-managed, skipping Supabase Auth deletion"
      );
    }

    // Step 3: Delete profile data based on user type - FIXED table operations
    console.log(`📋 Step 3: Deleting ${user.user_type} profile data...`);
    try {
      let profileDeleteError = null;

      switch (user.user_type) {
        case "student":
          const { error: studentError } = await supabaseClient
            .from("student_profiles")
            .delete()
            .eq("user_id", userId);
          profileDeleteError = studentError;
          break;

        case "employer":
          const { error: employerError } = await supabaseClient
            .from("employer_profiles")
            .delete()
            .eq("user_id", userId);
          profileDeleteError = employerError;
          break;

        case "admin":
          const { error: adminError } = await supabaseClient
            .from("admin_profiles")
            .delete()
            .eq("user_id", userId);
          profileDeleteError = adminError;
          break;

        default:
          console.log(
            `⚠️ Unknown user type for profile deletion: ${user.user_type}`
          );
      }

      if (profileDeleteError) {
        console.error(
          `❌ Failed to delete ${user.user_type} profile:`,
          profileDeleteError
        );
        deletionResults.errors.push(
          `Profile deletion failed: ${profileDeleteError.message}`
        );
      } else {
        console.log(`✅ Successfully deleted ${user.user_type} profile`);
        deletionResults.profile_deleted = true;
      }
    } catch (profileError) {
      console.error("❌ Exception during profile deletion:", profileError);
      deletionResults.errors.push(
        `Profile deletion exception: ${profileError.message}`
      );
    }

    // Step 4: Clean up audit logs related to this user
    console.log("📋 Step 4: Cleaning up audit logs...");
    try {
      const { error: auditError } = await supabaseClient
        .from("admin_audit_logs")
        .delete()
        .eq("resource_id", userId);

      if (auditError) {
        console.warn("⚠️ Failed to clean up audit logs:", auditError.message);
        deletionResults.errors.push(
          `Audit logs cleanup failed: ${auditError.message}`
        );
      } else {
        console.log("✅ Successfully cleaned up audit logs");
        deletionResults.audit_logs_deleted = true;
      }
    } catch (auditError) {
      console.warn(
        "⚠️ Exception during audit logs cleanup:",
        auditError.message
      );
      deletionResults.errors.push(
        `Audit logs cleanup exception: ${auditError.message}`
      );
    }

    // Step 5: Delete the main user record
    console.log("📋 Step 5: Deleting main user record...");
    try {
      const { error: userDeleteError } = await supabaseClient
        .from("users")
        .delete()
        .eq("id", userId);

      if (userDeleteError) {
        console.error(
          "❌ Critical error deleting user record:",
          userDeleteError
        );
        // This is critical - if we can't delete the user record, the deletion failed
        return res.status(500).json({
          success: false,
          message: "Failed to delete user record",
          code: "USER_DELETE_FAILED",
          error: userDeleteError.message,
          partialResults: deletionResults,
        });
      }

      console.log("✅ Successfully deleted user record");
      deletionResults.user_deleted = true;
    } catch (userError) {
      console.error("❌ Critical error deleting user record:", userError);
      // This is critical - if we can't delete the user record, the deletion failed
      return res.status(500).json({
        success: false,
        message: "Failed to delete user record",
        code: "USER_DELETE_FAILED",
        error: userError.message,
        partialResults: deletionResults,
      });
    }

    // Step 6: Log the deletion action
    console.log("📋 Step 6: Logging deletion action...");
    try {
      await supabaseClient.from("admin_audit_logs").insert({
        admin_user_id: req.admin.userId,
        action: "DELETE_USER_COMPLETE",
        resource_type: "users",
        resource_id: userId,
        old_values: {
          user_id: user.id,
          email: user.email,
          user_type: user.user_type,
          display_name: userDisplayName,
          deletion_results: deletionResults,
          deleted_at: new Date().toISOString(),
        },
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
      });
    } catch (auditError) {
      console.warn("⚠️ Failed to log deletion action:", auditError.message);
      // Don't fail the operation if audit logging fails
    }

    // Determine overall success
    const overallSuccess = deletionResults.user_deleted; // Main requirement
    const hasWarnings = deletionResults.errors.length > 0;

    console.log(`✅ User deletion completed: ${userDisplayName}`);
    console.log(`📊 Deletion results:`, deletionResults);

    res.json({
      success: true,
      message: hasWarnings
        ? `User deleted successfully with some warnings`
        : `User deleted successfully`,
      data: {
        deletedUser: {
          id: user.id,
          email: user.email,
          user_type: user.user_type,
          display_name: userDisplayName,
        },
        deletionResults: deletionResults,
        warnings: hasWarnings ? deletionResults.errors : undefined,
      },
    });
  } catch (error) {
    console.error("💥 Complete user deletion error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user completely",
      code: "USER_DELETION_FAILED",
      error: error.message,
    });
  }
};
