const { supabaseClient, supabaseAdmin } = require("../config/supabase");

// Console log to verify the controller is loaded
console.log("🔍 Loading universityAdminController.js");

// Get university admin dashboard data
exports.getDashboardData = async (req, res) => {
  try {
    console.log("📊 Getting university admin dashboard data");

    // Mock data for now - will be implemented with real academic records
    const mockStats = {
      totalGraduates: 1247,
      pendingApprovals: 23,
      completionRate: 85.7,
      recentGraduates: [],
    };

    res.json({
      success: true,
      data: mockStats,
    });
  } catch (error) {
    console.error("💥 University admin dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard data",
      error: error.message,
    });
  }
};

// Get university settings (simplified academic.programs only)
exports.getUniversitySettings = async (req, res) => {
  try {
    console.log(
      "📋 Fetching university settings for admin:",
      req.admin?.userId
    );
    if (!req.admin?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // get admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id, university_profiles(*)")
      .eq("user_id", req.admin.userId)
      .single();
    if (adminError || !adminProfile) {
      console.error("❌ Admin profile not found:", adminError);
      return res
        .status(404)
        .json({ success: false, message: "Admin profile not found" });
    }

    const uni = adminProfile.university_profiles;
    // fetch only the needed fields
    const { data: programs = [], error: progError } = await supabaseClient
      .from("academic_programs")
      .select("id, program, faculty, duration, is_active")
      .eq("university_id", adminProfile.university_id)
      .order("created_at", { ascending: false });
    if (progError) {
      console.error("❌ Error loading programs:", progError);
    }

    const universitySettings = {
      profile: {
        name: uni.name || "",
        short_name: uni.short_name || "",
        email: uni.email || "",
        phone: uni.phone || "",
        website: uni.website || "",
        address: uni.address || "",
        country: uni.country || "",
        city: uni.city || "",
        logo_url: uni.logo_url || "",
        registration_number: uni.registration_number || "",
        accreditation_body: uni.accreditation_body || "",
        is_active: uni.is_active !== false,
        is_verified: uni.is_verified !== false,
      },
      academic: {
        programs: programs.map((p) => ({
          id: p.id,
          program: p.program,
          faculty: p.faculty,
          duration: p.duration,
          is_active: p.is_active,
        })),
      },
      documents: {
        certificate_template: "standard",
        transcript_template: "detailed",
        digital_signature_enabled: true,
        auto_approval: false,
        watermark_enabled: true,
        qr_verification: true,
      },
      notifications: {
        email_enabled: true,
        document_approval_alerts: true,
        graduation_reminders: true,
        system_maintenance: true,
        weekly_reports: false,
      },
      security: {
        two_factor_required: false,
        session_timeout: 30,
        password_expiry_days: 90,
        audit_log_retention: 365,
        ip_whitelist: [],
      },
      integration: {
        api_enabled: true,
        webhook_url: "",
        blockchain_network: "ethereum",
        third_party_verifications: false,
      },
    };

    res.json({ success: true, data: universitySettings });
  } catch (error) {
    console.error("💥 getUniversitySettings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

// Update university settings
exports.updateUniversitySettings = async (req, res) => {
  try {
    console.log(
      "💾 Updating university settings - controller function executed"
    );
    console.log("📋 Admin user from request:", req.admin?.userId);
    console.log("📋 Request body received:", req.body);

    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - no admin user found",
      });
    }

    const settings = req.body;

    // Get university admin profile to find university_id
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      console.error("❌ Error fetching admin profile:", adminError);
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    console.log(
      "✅ Found admin profile for university:",
      adminProfile.university_id
    );

    // Handle profile updates if provided
    if (settings.profile) {
      console.log("🔄 Updating university profile");
      console.log("📋 Profile data to update:", settings.profile);

      // Prepare profile update data with proper field mapping
      const profileUpdate = {
        name: settings.profile.name?.trim(),
        short_name: settings.profile.short_name?.trim(),
        email: settings.profile.email?.trim(),
        phone: settings.profile.phone?.trim(),
        country: settings.profile.country?.trim(),
        city: settings.profile.city?.trim(),
        address: settings.profile.address?.trim(),
        website: settings.profile.website?.trim(),
        logo_url: settings.profile.logo_url?.trim(),
        registration_number: settings.profile.registration_number?.trim(),
        accreditation_body: settings.profile.accreditation_body?.trim(),
        is_active: settings.profile.is_active,
        is_verified: settings.profile.is_verified,
        updated_at: new Date().toISOString(),
      };

      // Remove undefined values to prevent database errors
      Object.keys(profileUpdate).forEach((key) => {
        if (profileUpdate[key] === undefined) {
          delete profileUpdate[key];
        }
      });

      console.log("📋 Cleaned profile update data:", profileUpdate);

      const { data: updatedProfile, error: profileError } = await supabaseClient
        .from("university_profiles")
        .update(profileUpdate)
        .eq("id", adminProfile.university_id)
        .select()
        .single();

      if (profileError) {
        console.error("❌ Error updating university profile:", profileError);
        return res.status(500).json({
          success: false,
          message: "Failed to update university profile",
          error: profileError.message,
        });
      }

      console.log(
        "✅ University profile updated successfully:",
        updatedProfile.name
      );
    }

    // Handle academic programs update if provided
    if (settings.academic?.programs) {
      console.log("🔄 Updating academic programs");

      // First, get existing programs
      const { data: existingPrograms } = await supabaseClient
        .from("academic_programs")
        .select("id")
        .eq("university_id", adminProfile.university_id);

      // Delete existing programs
      if (existingPrograms && existingPrograms.length > 0) {
        await supabaseClient
          .from("academic_programs")
          .delete()
          .eq("university_id", adminProfile.university_id);
      }

      // Insert new programs
      const programsToInsert = settings.academic.programs.map((p) => ({
        university_id: adminProfile.university_id,
        program: p.program,
        faculty: p.faculty,
        duration: p.duration,
        is_active: p.is_active !== false,
        created_by: req.admin.userId,
      }));

      if (programsToInsert.length > 0) {
        const { error: insertError } = await supabaseClient
          .from("academic_programs")
          .insert(programsToInsert);

        if (insertError) {
          console.error("❌ Error inserting programs:", insertError);
          return res.status(500).json({
            success: false,
            message: "Failed to update academic programs",
            error: insertError.message,
          });
        }
      }

      console.log(`✅ Updated ${programsToInsert.length} academic programs`);
    }

    // Handle documents settings update if provided
    if (settings.documents) {
      console.log(
        "🔄 Document settings update requested (not yet implemented)"
      );
    }

    // Handle notifications settings update if provided
    if (settings.notifications) {
      console.log(
        "🔄 Notification settings update requested (not yet implemented)"
      );
    }

    // Handle security settings update if provided
    if (settings.security) {
      console.log(
        "🔄 Security settings update requested (not yet implemented)"
      );
    }

    res.json({
      success: true,
      message: "University settings updated successfully",
      data: {
        profileUpdated: !!settings.profile,
        academicUpdated: !!settings.academic?.programs,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("💥 Update university settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update university settings",
      error: error.message,
    });
  }
};

// Update university admin settings
exports.updateSettings = async (req, res) => {
  try {
    console.log("💾 Updating university admin settings");
    const settings = req.body;

    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "University admin authentication required",
      });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Handle academic programs update if provided
    if (settings.academic?.programs) {
      console.log("🔄 Updating academic programs");

      // First, get existing programs
      const { data: existingPrograms } = await supabaseClient
        .from("academic_programs")
        .select("id")
        .eq("university_id", adminProfile.university_id);

      // Delete existing programs
      if (existingPrograms && existingPrograms.length > 0) {
        await supabaseClient
          .from("academic_programs")
          .delete()
          .eq("university_id", adminProfile.university_id);
      }

      // Insert new programs - FIX: Use correct column names
      const programsToInsert = settings.academic.programs.map((p) => ({
        university_id: adminProfile.university_id,
        program: p.program, // Use 'program' not 'program_name'
        faculty: p.faculty,
        duration: p.duration,
        is_active: p.is_active !== false,
        created_by: req.admin.userId,
      }));

      if (programsToInsert.length > 0) {
        const { error: insertError } = await supabaseClient
          .from("academic_programs")
          .insert(programsToInsert);

        if (insertError) {
          console.error("❌ Error inserting programs:", insertError);
          throw insertError;
        }
      }

      console.log(`✅ Updated ${programsToInsert.length} academic programs`);
    }

    // Handle profile updates if provided
    if (settings.profile) {
      console.log("🔄 Updating university profile");

      const profileUpdate = {
        name: settings.profile.name,
        short_name: settings.profile.short_name,
        phone: settings.profile.phone,
        country: settings.profile.country,
        city: settings.profile.city,
        address: settings.profile.address,
        website: settings.profile.website,
        logo_url: settings.profile.logo_url,
        registration_number: settings.profile.registration_number,
        accreditation_body: settings.profile.accreditation_body,
        is_active: settings.profile.is_active,
        is_verified: settings.profile.is_verified,
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabaseClient
        .from("university_profiles")
        .update(profileUpdate)
        .eq("id", adminProfile.university_id);

      if (profileError) {
        console.error("❌ Error updating profile:", profileError);
        throw profileError;
      }

      console.log("✅ University profile updated");
    }

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    console.error("💥 Update settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: error.message,
    });
  }
};

// Get academic programs for the university
exports.getAcademicPrograms = async (req, res) => {
  try {
    console.log("📚 Fetching academic programs");

    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "University admin authentication required",
      });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Get programs with pagination
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const {
      data: programs,
      error: programsError,
      count,
    } = await supabaseClient
      .from("academic_programs")
      .select("*", { count: "exact" })
      .eq("university_id", adminProfile.university_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (programsError) {
      console.error("❌ Error fetching programs:", programsError);
      throw programsError;
    }

    res.json({
      success: true,
      data: {
        programs: programs || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    console.error("💥 Get academic programs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch academic programs",
      error: error.message,
    });
  }
};

// Add a single academic program
exports.addAcademicProgram = async (req, res) => {
  try {
    console.log("➕ Adding new academic program");
    const { program_name, faculty, duration } = req.body;

    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "University admin authentication required",
      });
    }

    // Validate required fields
    if (!program_name?.trim() || !faculty?.trim() || !duration?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Program name, faculty, and duration are required",
      });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Insert new program - FIX: Use correct column name
    const { data: newProgram, error: insertError } = await supabaseClient
      .from("academic_programs")
      .insert({
        university_id: adminProfile.university_id,
        program: program_name.trim(), // Use 'program' not 'program_name'
        faculty: faculty.trim(),
        duration: duration.trim(),
        is_active: true,
        created_by: req.admin.userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error("❌ Error inserting program:", insertError);

      if (insertError.code === "23505") {
        return res.status(400).json({
          success: false,
          message: "A program with this name already exists",
        });
      }

      throw insertError;
    }

    console.log("✅ Academic program added:", newProgram.program);

    res.status(201).json({
      success: true,
      message: "Academic program added successfully",
      data: newProgram,
    });
  } catch (error) {
    console.error("💥 Add academic program error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add academic program",
      error: error.message,
    });
  }
};

// Update academic program
exports.updateAcademicProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const updateData = req.body;

    console.log(`✏️ Updating academic program: ${programId}`);

    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "University admin authentication required",
      });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Update program without updated_by tracking
    const { data: updatedProgram, error: updateError } = await supabaseClient
      .from("academic_programs")
      .update({
        program: updateData.program_name,
        faculty: updateData.faculty,
        duration: updateData.duration,
        is_active: updateData.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", programId)
      .eq("university_id", adminProfile.university_id)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error updating program:", updateError);
      throw updateError;
    }

    if (!updatedProgram) {
      return res.status(404).json({
        success: false,
        message: "Program not found or access denied",
      });
    }

    console.log("✅ Academic program updated:", updatedProgram.program);

    res.json({
      success: true,
      message: "Academic program updated successfully",
      data: updatedProgram,
    });
  } catch (error) {
    console.error("💥 Update academic program error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update academic program",
      error: error.message,
    });
  }
};

// Get academic programs with simplified information
exports.getAcademicPrograms = async (req, res) => {
  try {
    console.log("📚 Fetching academic programs");

    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "University admin authentication required",
      });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Get programs with pagination
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const {
      data: programs,
      error: programsError,
      count,
    } = await supabaseClient
      .from("academic_programs")
      .select("*", { count: "exact" })
      .eq("university_id", adminProfile.university_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (programsError) {
      console.error("❌ Error fetching programs:", programsError);
      throw programsError;
    }

    res.json({
      success: true,
      data: {
        programs: programs || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });
  } catch (error) {
    console.error("💥 Get academic programs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch academic programs",
      error: error.message,
    });
  }
};

// Delete academic program
exports.deleteAcademicProgram = async (req, res) => {
  try {
    const { programId } = req.params;

    console.log(`🗑️ Deleting academic program: ${programId}`);

    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "University admin authentication required",
      });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Delete program (only if it belongs to this university)
    const { data: deletedProgram, error: deleteError } = await supabaseClient
      .from("academic_programs")
      .delete()
      .eq("id", programId)
      .eq("university_id", adminProfile.university_id)
      .select()
      .single();

    if (deleteError) {
      console.error("❌ Error deleting program:", deleteError);
      throw deleteError;
    }

    if (!deletedProgram) {
      return res.status(404).json({
        success: false,
        message: "Program not found or access denied",
      });
    }

    console.log("✅ Academic program deleted:", deletedProgram.program);

    res.json({
      success: true,
      message: "Academic program deleted successfully",
      data: deletedProgram,
    });
  } catch (error) {
    console.error("💥 Delete academic program error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete academic program",
      error: error.message,
    });
  }
};

// Bulk upload academic programs
exports.bulkUploadPrograms = async (req, res) => {
  try {
    console.log("🚀 Starting bulkUploadPrograms");
    if (!req.admin?.userId) {
      return res.status(401).json({
        success: false,
        message: "University admin authentication required",
      });
    }

    // Get admin profile to find university_id
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();
    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Validate request body
    if (!Array.isArray(req.body?.programs)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing programs array",
      });
    }

    // Prepare programs to insert
    const programsToInsert = req.body.programs.map((p) => ({
      university_id: adminProfile.university_id,
      program: p.program?.trim(),
      faculty: p.faculty?.trim(),
      duration: p.duration?.trim(),
      is_active: p.is_active !== false,
      created_by: req.admin.userId,
    }));

    // Insert programs
    const { error: insertError } = await supabaseClient
      .from("academic_programs")
      .insert(programsToInsert);
    if (insertError) {
      console.error("❌ Bulk upload insert error:", insertError);
      return res.status(500).json({
        success: false,
        message: "Bulk upload failed",
        error: insertError.message,
      });
    }

    console.log(
      "✅ Bulk upload completed:",
      programsToInsert.length,
      "programs added"
    );
    return res.json({
      success: true,
      message: "Bulk programs uploaded successfully",
      data: programsToInsert,
    });
  } catch (error) {
    console.error("❌ Bulk upload error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to bulk upload programs",
      error: error.message,
    });
  }
};

// Add new function to retrieve academic programs (dropdown only)
exports.getProgramsDropdown = async (req, res) => {
  try {
    if (!req.admin?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    // Get university admin profile to obtain university_id
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();
    if (adminError || !adminProfile) {
      return res
        .status(404)
        .json({ success: false, message: "Admin profile not found" });
    }
    // Fetch only id and program fields for dropdown
    const { data: programs, error: programError } = await supabaseClient
      .from("academic_programs")
      .select("id, program")
      .eq("university_id", adminProfile.university_id);
    if (programError) {
      return res.status(500).json({
        success: false,
        message: "Failed to load programs",
        error: programError.message,
      });
    }
    res.json({ success: true, data: programs });
  } catch (error) {
    console.error("💥 getProgramsDropdown error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load programs",
      error: error.message,
    });
  }
};

// Get Graduate Records for the university
exports.getGraduateRecords = async (req, res) => {
  // Disable caching for fresh responses
  res.set("Cache-Control", "no-store");

  console.log("🎓 Fetching graduate records for university admin");

  if (!req.admin?.userId) {
    return res.status(401).json({
      success: false,
      message: "University admin authentication required",
    });
  }

  // Get university_id for filtering and log it
  const { data: adminProfile, error: adminProfileError } = await supabaseClient
    .from("university_admin_profiles")
    .select("university_id")
    .eq("user_id", req.admin?.userId)
    .single();
  if (adminProfileError || !adminProfile) {
    console.error(
      "❌ Error fetching university admin profile:",
      adminProfileError
    );
    return res.status(404).json({
      success: false,
      message: "University admin profile not found",
    });
  }

  const universityId = adminProfile.university_id;
  console.log(`✅ Using university_id: ${universityId}`);

  // Log query parameters for debugging
  const { page = 1, limit = 10, search } = req.query;
  console.log(
    `📋 Query params - page: ${page}, limit: ${limit}, search: ${search}`
  );

  // Get records with pagination and join with academic_programs
  const offset = (page - 1) * limit;
  let query = supabaseClient
    .from("graduate_records")
    .select(
      `
      id,
      student_full_name,
      registration_number,
      graduation_year,
      is_verified,
      created_at,
      academic_programs (program), 
      certificate_url,
      transcript_url
      `,
      { count: "exact" }
    )
    .eq("university_id", universityId);

  if (search) {
    query = query.or(
      `student_full_name.ilike.%${search}%,registration_number.ilike.%${search}%`
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + parseInt(limit) - 1);

  const { data: records, error: recordsError, count } = await query;
  if (recordsError) {
    console.error("❌ Error fetching graduate records:", recordsError);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch graduate records",
      error: recordsError.message,
    });
  }

  console.log(
    `✅ Successfully fetched ${records.length} graduate records (Total count: ${count})`
  );

  // Transform records to include program name
  const transformedRecords = records.map((record) => ({
    ...record,
    program_name: record.academic_programs?.program || "N/A",
    academic_programs: undefined,
  }));

  res.json({
    success: true,
    data: {
      records: transformedRecords || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalItems: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    },
  });
};

// Create graduate record
exports.createGraduateRecord = async (req, res) => {
  // --- NEW DEBUG LOGS ---
  console.log("📥 Incoming headers.content-type:", req.headers["content-type"]);
  console.log("📥 req.is multipart/form-data:", req.is("multipart/form-data"));
  console.log(
    "📥 req.files keys:",
    req.files ? Object.keys(req.files) : "none"
  );

  try {
    // 1. Authorization check
    if (!req.admin?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    // 2. Verify admin profile and get universityId
    const { data: adminProfiles, error: profileError } = await supabaseClient
      .from("university_admin_profiles")
      .select("id, university_id, email")
      .eq("user_id", req.admin.userId);
    if (profileError) {
      console.error("Error fetching admin profile:", profileError);
      throw profileError;
    }

    let universityId;
    if (adminProfiles && adminProfiles.length > 0) {
      universityId = adminProfiles[0].university_id;
    } else {
      console.log(
        "Admin profile not found by user_id, trying by email:",
        req.admin.email
      );
      const { data: fallback, error: fallbackErr } = await supabaseClient
        .from("university_admin_profiles")
        .select("id, university_id")
        .eq("email", req.admin.email); // Assuming req.admin.email is available
      if (fallbackErr) {
        console.error("Error fetching admin profile by email:", fallbackErr);
        throw fallbackErr;
      }
      if (!fallback || fallback.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Admin profile not found. Please contact support.",
        });
      }
      universityId = fallback[0].university_id;
    }
    console.log("✅ Using university_id:", universityId);

    // NEW: Fetch university short_name for folder structure
    let universityShortName = universityId; // Fallback to universityId if short_name is not found
    if (universityId) {
      const { data: uniProfile, error: uniProfileError } = await supabaseClient
        .from("university_profiles")
        .select("short_name")
        .eq("id", universityId)
        .single();

      if (uniProfileError) {
        console.warn(
          "⚠️ Could not fetch university short_name:",
          uniProfileError.message
        );
      } else if (uniProfile && uniProfile.short_name) {
        universityShortName = uniProfile.short_name
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_.-]/g, ""); // Sanitize for folder name
      }
      if (!universityShortName) {
        // Additional fallback if short_name is empty after sanitization
        universityShortName = universityId;
        console.warn(
          `⚠️ University short_name is empty or invalid, using university_id as folder name: ${universityId}`
        );
      }
    }
    console.log("📁 Using folder name for storage:", universityShortName);

    // 3. Validate required fields
    const { graduation_year, student_full_name, registration_number, program } =
      req.body;
    if (
      !graduation_year ||
      !student_full_name ||
      !registration_number ||
      !program
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // 4. Handle file uploads first
    let certificate_url = null;
    let transcript_url = null;

    const storageClient = supabaseAdmin
      ? supabaseAdmin.storage
      : supabaseClient.storage;
    console.log(
      `Using ${
        supabaseAdmin ? "admin" : "regular"
      } client for storage operations`
    );

    if (req.files) {
      // Certificate upload
      if (req.files.certificate && req.files.certificate.length > 0) {
        const file = req.files.certificate[0];
        // UPDATED: Construct filename with universityShortName as folder
        const filePath = `${universityShortName}/${Date.now()}_certificate_${file.originalname.replace(
          /\s+/g,
          "_"
        )}`;
        console.log(
          "📄 Uploading certificate to path:",
          filePath,
          "MIME type:",
          file.mimetype
        );
        const { error: certErr } = await storageClient
          .from("graduate-record")
          .upload(filePath, file.buffer, {
            // Use filePath
            contentType: file.mimetype,
            upsert: false,
          });
        if (certErr) {
          console.error("❌ Certificate upload error:", certErr);
          return res.status(500).json({
            success: false,
            message: "Certificate upload failed",
            error: certErr.message,
          });
        }
        const { data: certData } = storageClient
          .from("graduate-record")
          .getPublicUrl(filePath); // Use filePath
        certificate_url = certData.publicUrl;
        console.log("🔗 Certificate public URL:", certificate_url);
      }

      // Transcript upload
      if (req.files.transcript && req.files.transcript.length > 0) {
        const file = req.files.transcript[0];
        // UPDATED: Construct filename with universityShortName as folder
        const filePath = `${universityShortName}/${Date.now()}_transcript_${file.originalname.replace(
          /\s+/g,
          "_"
        )}`;
        console.log(
          "📄 Uploading transcript to path:",
          filePath,
          "MIME type:",
          file.mimetype
        );
        const { error: transErr } = await storageClient
          .from("graduate-record")
          .upload(filePath, file.buffer, {
            // Use filePath
            contentType: file.mimetype,
            upsert: false,
          });
        if (transErr) {
          console.error("❌ Transcript upload error:", transErr);
          return res.status(500).json({
            success: false,
            message: "Transcript upload failed",
            error: transErr.message,
          });
        }
        const { data: transData } = storageClient
          .from("graduate-record")
          .getPublicUrl(filePath); // Use filePath
        transcript_url = transData.publicUrl;
        console.log("🔗 Transcript public URL:", transcript_url);
      }
    } else {
      console.log("ℹ️ No files uploaded");
    }

    // 5. Insert record into DB with URLs
    const db = supabaseAdmin || supabaseClient; // Use admin client if available for DB insert
    console.log(
      `Using ${
        supabaseAdmin ? "admin" : "regular"
      } client for database insertion`
    );

    const currentTimestamp = new Date().toISOString(); // Get current time once

    const { data, error } = await db
      .from("graduate_records")
      .insert({
        university_id: universityId,
        program_id: program,
        student_full_name,
        registration_number,
        graduation_year,
        certificate_url,
        transcript_url,
        created_by: req.admin.userId,
        // UPDATED: Add verification fields
        is_verified: true,
        verified_by: req.admin.userId,
        verified_at: currentTimestamp,
        created_at: currentTimestamp, // Ensure created_at is also set if not auto-set by DB
        updated_at: currentTimestamp, // Ensure updated_at is also set
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Insert error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed creating record",
        error: error.message,
      });
    }

    console.log("✅ Graduate record created successfully:", data);
    return res
      .status(201)
      .json({ success: true, message: "Graduate record created", data });
  } catch (err) {
    console.error("💥 Error in createGraduateRecord:", err);
    // Ensure specific error details are not leaked in production if err.message is sensitive
    const errorMessage =
      process.env.NODE_ENV === "production" ? "Server error" : err.message;
    return res
      .status(500)
      .json({ success: false, message: errorMessage, error: err.toString() });
  }
};

// Download files as ZIP
exports.downloadRecordFiles = async (req, res) => {
  try {
    const { recordId } = req.params;
    console.log("📦 Creating ZIP download for record:", recordId);

    if (!req.admin?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Get record with file URLs
    const { data: record, error: recordError } = await supabaseClient
      .from("graduate_records")
      .select(
        "student_full_name, registration_number, certificate_url, transcript_url"
      )
      .eq("id", recordId)
      .eq("university_id", adminProfile.university_id)
      .single();

    if (recordError || !record) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    if (!record.certificate_url && !record.transcript_url) {
      return res.status(400).json({
        success: false,
        message: "No files available for download",
      });
    }

    const JSZip = require("jszip");
    const zip = new JSZip();
    const storageClient = supabaseAdmin
      ? supabaseAdmin.storage
      : supabaseClient.storage;

    console.log("📁 Processing files for ZIP:", {
      certificate_url: record.certificate_url,
      transcript_url: record.transcript_url,
    });

    // Helper function to extract file path from Supabase URL
    const extractFilePath = (url) => {
      if (!url) return null;

      console.log("🔍 Extracting file path from URL:", url);

      // For Supabase storage URLs, the structure is:
      // https://project.supabase.co/storage/v1/object/public/bucket-name/path/to/file
      // We need to extract everything after '/object/public/graduate-record/'

      const parts = url.split("/");
      const bucketIndex = parts.findIndex((part) => part === "graduate-record");

      if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
        // Get everything after 'graduate-record' in the URL
        const filePath = parts.slice(bucketIndex + 1).join("/");
        console.log("✅ Extracted file path:", filePath);
        return filePath;
      }

      // Alternative extraction method - look for the storage pattern
      const storageMatch = url.match(
        /\/storage\/v1\/object\/public\/graduate-record\/(.+)$/
      );
      if (storageMatch) {
        const filePath = storageMatch[1];
        console.log("✅ Extracted file path (alternative method):", filePath);
        return filePath;
      }

      // Fallback: use the last part of the URL
      const fallbackPath = parts[parts.length - 1];
      console.log("⚠️ Using fallback file path:", fallbackPath);
      return fallbackPath;
    };

    // Download certificate if exists
    if (record.certificate_url) {
      try {
        const filePath = extractFilePath(record.certificate_url);

        if (!filePath) {
          console.warn(
            "❌ Could not extract file path from certificate URL:",
            record.certificate_url
          );
        } else {
          console.log("📄 Downloading certificate from path:", filePath);

          const { data: certData, error: certError } = await storageClient
            .from("graduate-record")
            .download(filePath);

          if (certError) {
            console.warn(
              "❌ Failed to download certificate:",
              certError.message
            );
            console.warn("❌ Attempted path:", filePath);
          } else if (certData) {
            const extension = filePath.split(".").pop() || "pdf";
            const fileName = `certificate.${extension}`;
            zip.file(fileName, certData);
            console.log("✅ Certificate added to ZIP as:", fileName);
          }
        }
      } catch (error) {
        console.warn("❌ Certificate download exception:", error.message);
      }
    }

    // Download transcript if exists
    if (record.transcript_url) {
      try {
        const filePath = extractFilePath(record.transcript_url);

        if (!filePath) {
          console.warn(
            "❌ Could not extract transcript file path from URL:",
            record.transcript_url
          );
        } else {
          console.log("📄 Downloading transcript from path:", filePath);

          const { data: transcriptData, error: transcriptError } =
            await storageClient.from("graduate-record").download(filePath);

          if (transcriptError) {
            console.warn(
              "❌ Failed to download transcript:",
              transcriptError.message
            );
            console.warn("❌ Attempted path:", filePath);
          } else if (transcriptData) {
            const extension = filePath.split(".").pop() || "pdf";
            const fileName = `transcript.${extension}`;
            zip.file(fileName, transcriptData);
            console.log("✅ Transcript added to ZIP as:", fileName);
          }
        }
      } catch (error) {
        console.warn("❌ Transcript download exception:", error.message);
      }
    }

    // Check if ZIP has any files
    const fileCount = Object.keys(zip.files).length;
    console.log(`📦 ZIP contains ${fileCount} files`);

    if (fileCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No files could be downloaded from storage. Please check file paths and storage configuration.",
      });
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    console.log(`📦 Generated ZIP buffer of size: ${zipBuffer.length} bytes`);

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${record.student_full_name.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}_${record.registration_number}_records.zip"`,
      "Content-Length": zipBuffer.length.toString(),
    });

    res.send(zipBuffer);
    console.log("✅ ZIP file sent successfully");
  } catch (error) {
    console.error("💥 Download files error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download files",
      error: error.message,
    });
  }
};

// Delete graduate record and associated files
exports.deleteGraduateRecord = async (req, res) => {
  try {
    const { recordId } = req.params;
    console.log("🗑️ Deleting graduate record:", recordId);

    if (!req.admin?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Get university admin profile
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("university_admin_profiles")
      .select("university_id")
      .eq("user_id", req.admin.userId)
      .single();

    if (adminError || !adminProfile) {
      return res.status(404).json({
        success: false,
        message: "University admin profile not found",
      });
    }

    // Get record with file URLs before deletion
    const { data: record, error: recordError } = await supabaseClient
      .from("graduate_records")
      .select("student_full_name, certificate_url, transcript_url")
      .eq("id", recordId)
      .eq("university_id", adminProfile.university_id)
      .single();

    if (recordError || !record) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    const storageClient = supabaseAdmin
      ? supabaseAdmin.storage
      : supabaseClient.storage;
    const deletionResults = {
      recordDeleted: false,
      certificateDeleted: false,
      transcriptDeleted: false,
      errors: [],
    };

    // Helper function to extract file path (same as download function)
    const extractFilePath = (url) => {
      if (!url) return null;

      console.log("🔍 Extracting file path for deletion from URL:", url);

      const parts = url.split("/");
      const bucketIndex = parts.findIndex((part) => part === "graduate-record");

      if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
        const filePath = parts.slice(bucketIndex + 1).join("/");
        console.log("✅ Extracted file path for deletion:", filePath);
        return filePath;
      }

      const storageMatch = url.match(
        /\/storage\/v1\/object\/public\/graduate-record\/(.+)$/
      );
      if (storageMatch) {
        const filePath = storageMatch[1];
        console.log(
          "✅ Extracted file path for deletion (alternative method):",
          filePath
        );
        return filePath;
      }

      const fallbackPath = parts[parts.length - 1];
      console.log("⚠️ Using fallback file path for deletion:", fallbackPath);
      return fallbackPath;
    };

    // Delete certificate from storage
    if (record.certificate_url) {
      try {
        const filePath = extractFilePath(record.certificate_url);

        if (!filePath) {
          console.warn(
            "❌ Could not extract certificate file path for deletion"
          );
          deletionResults.errors.push(
            "Could not extract certificate file path"
          );
        } else {
          console.log("🗑️ Deleting certificate from path:", filePath);

          const { error: certDeleteError } = await storageClient
            .from("graduate-record")
            .remove([filePath]);

          if (certDeleteError) {
            console.warn(
              "❌ Failed to delete certificate:",
              certDeleteError.message
            );
            deletionResults.errors.push(
              `Certificate deletion failed: ${certDeleteError.message}`
            );
          } else {
            deletionResults.certificateDeleted = true;
            console.log("✅ Certificate deleted from storage");
          }
        }
      } catch (error) {
        console.warn("❌ Certificate deletion exception:", error.message);
        deletionResults.errors.push(
          `Certificate deletion error: ${error.message}`
        );
      }
    }

    // Delete transcript from storage
    if (record.transcript_url) {
      try {
        const filePath = extractFilePath(record.transcript_url);

        if (!filePath) {
          console.warn(
            "❌ Could not extract transcript file path for deletion"
          );
          deletionResults.errors.push("Could not extract transcript file path");
        } else {
          console.log("🗑️ Deleting transcript from path:", filePath);

          const { error: transcriptDeleteError } = await storageClient
            .from("graduate-record")
            .remove([filePath]);

          if (transcriptDeleteError) {
            console.warn(
              "❌ Failed to delete transcript:",
              transcriptDeleteError.message
            );
            deletionResults.errors.push(
              `Transcript deletion failed: ${transcriptDeleteError.message}`
            );
          } else {
            deletionResults.transcriptDeleted = true;
            console.log("✅ Transcript deleted from storage");
          }
        }
      } catch (error) {
        console.warn("❌ Transcript deletion exception:", error.message);
        deletionResults.errors.push(
          `Transcript deletion error: ${error.message}`
        );
      }
    }

    // Delete record from database
    const { error: deleteError } = await supabaseClient
      .from("graduate_records")
      .delete()
      .eq("id", recordId)
      .eq("university_id", adminProfile.university_id);

    if (deleteError) {
      console.error("❌ Failed to delete record from database:", deleteError);
      return res.status(500).json({
        success: false,
        message: "Failed to delete record from database",
        error: deleteError.message,
      });
    }

    deletionResults.recordDeleted = true;
    console.log(
      "✅ Graduate record deleted successfully:",
      record.student_full_name
    );

    res.json({
      success: true,
      message: "Graduate record deleted successfully",
      data: {
        deletedRecord: record.student_full_name,
        deletionResults,
      },
    });
  } catch (error) {
    console.error("💥 Delete graduate record error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete graduate record",
      error: error.message,
    });
  }
};

// Get signed URL for file preview
exports.getPreviewUrl = async (req, res) => {
  try {
    const { fileUrl } = req.body;
    console.log("🔗 Getting preview URL for:", fileUrl);

    if (!req.admin?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: "File URL is required",
      });
    }

    // Extract file path from Supabase URL
    const extractFilePath = (url) => {
      if (!url) return null;

      console.log("🔍 Extracting file path from URL:", url);

      // For Supabase storage URLs, the structure is:
      // https://project.supabase.co/storage/v1/object/public/bucket-name/path/to/file
      // We need to extract everything after '/object/public/graduate-record/'

      const parts = url.split("/");
      const bucketIndex = parts.findIndex((part) => part === "graduate-record");

      if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
        // Get everything after 'graduate-record' in the URL
        const filePath = parts.slice(bucketIndex + 1).join("/");
        console.log("✅ Extracted file path:", filePath);
        return filePath;
      }

      // Alternative extraction method - look for the storage pattern
      const storageMatch = url.match(
        /\/storage\/v1\/object\/public\/graduate-record\/(.+)$/
      );
      if (storageMatch) {
        const filePath = storageMatch[1];
        console.log("✅ Extracted file path (alternative method):", filePath);
        return filePath;
      }

      // Fallback: use the last part of the URL
      const fallbackPath = parts[parts.length - 1];
      console.log("⚠️ Using fallback file path:", fallbackPath);
      return fallbackPath;
    };

    const filePath = extractFilePath(fileUrl);

    if (!filePath) {
      console.error("❌ Could not extract file path from URL:", fileUrl);
      return res.status(400).json({
        success: false,
        message: "Invalid file URL format",
      });
    }

    const storageClient = supabaseAdmin
      ? supabaseAdmin.storage
      : supabaseClient.storage;

    try {
      // Try to create a signed URL for private access
      const { data: signedUrlData, error: signedError } = await storageClient
        .from("graduate-record")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (signedError) {
        console.warn("⚠️ Failed to create signed URL:", signedError.message);

        // Fallback: try public URL
        const { data: publicUrlData } = storageClient
          .from("graduate-record")
          .getPublicUrl(filePath);

        if (publicUrlData?.publicUrl) {
          console.log(
            "✅ Using public URL as fallback:",
            publicUrlData.publicUrl
          );
          return res.json({
            success: true,
            signedUrl: publicUrlData.publicUrl,
            isPublic: true,
          });
        } else {
          throw new Error("Failed to get both signed and public URLs");
        }
      }

      if (signedUrlData?.signedUrl) {
        console.log("✅ Created signed URL successfully");
        return res.json({
          success: true,
          signedUrl: signedUrlData.signedUrl,
          isPublic: false,
        });
      } else {
        throw new Error("No signed URL returned");
      }
    } catch (urlError) {
      console.error("❌ Storage URL creation error:", urlError);

      // Final fallback: return original URL
      console.log("⚠️ Using original URL as final fallback");
      return res.json({
        success: true,
        signedUrl: fileUrl,
        isPublic: true,
        fallback: true,
      });
    }
  } catch (error) {
    console.error("💥 Get preview URL error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get preview URL",
      error: error.message,
    });
  }
};

// Console log to verify all controller functions are exported
console.log("✅ University Admin Controller exports:", Object.keys(exports));
