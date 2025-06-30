const { supabaseClient, supabaseAdmin } = require("../config/supabase");

// Get all universities for dropdown
exports.getUniversities = async (req, res) => {
  try {
    console.log("📋 Fetching universities for verification form");

    const { data: universities, error } = await supabaseClient
      .from("university_profiles")
      .select("id, name, short_name, country, city")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("❌ Error fetching universities:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(`✅ Found ${universities?.length || 0} active universities`);

    res.json({
      success: true,
      data: universities || [],
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

// Get academic programs for a specific university
exports.getUniversityPrograms = async (req, res) => {
  try {
    const { universityId } = req.params;
    console.log(`📋 Fetching programs for university: ${universityId}`);

    if (!universityId) {
      return res.status(400).json({
        success: false,
        message: "University ID is required",
      });
    }

    // First, let's check what columns actually exist in academic_programs
    const { data: programs, error } = await supabaseClient
      .from("academic_programs")
      .select("*") // Select all columns first to see what's available
      .eq("university_id", universityId)
      .eq("is_active", true)
      .order("program", { ascending: true }); // Limit to see the structure

    if (error) {
      console.error("❌ Error fetching programs:", error);

      // If 'name' doesn't work, try 'program' or other common column names
      if (error.code === "42703") {
        console.log("🔍 Trying alternative column names...");

        // Try with 'program' column instead
        const { data: programsAlt, error: errorAlt } = await supabaseClient
          .from("academic_programs")
          .select("id, program, duration_years")
          .eq("university_id", universityId)
          .eq("is_active", true)
          .order("program", { ascending: true });

        if (errorAlt) {
          console.error("❌ Alternative query also failed:", errorAlt);
          throw new Error(`Database error: ${errorAlt.message}`);
        }

        console.log(
          `✅ Found ${programsAlt?.length || 0} programs using 'program' column`
        );

        // Transform the data to match expected frontend format
        const transformedPrograms = (programsAlt || []).map((prog) => ({
          id: prog.id,
          program_name: prog.program, // Map 'program' to 'program_name' for frontend
          duration_years: prog.duration_years,
        }));

        return res.json({
          success: true,
          data: transformedPrograms,
        });
      }

      throw new Error(`Database error: ${error.message}`);
    }

    console.log(
      `✅ Found ${
        programs?.length || 0
      } programs for university ${universityId}`
    );
    console.log("🔍 Sample program structure:", programs?.[0]);

    // Transform data if needed based on actual column structure
    const transformedPrograms = (programs || []).map((prog) => ({
      id: prog.id,
      program_name: prog.name || prog.program || prog.program_name, // Handle multiple possible column names
      duration_years: prog.duration_years,
    }));

    res.json({
      success: true,
      data: transformedPrograms,
    });
  } catch (error) {
    console.error("💥 Get programs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch programs",
      error: error.message,
    });
  }
};

// Get graduation years for a specific university
exports.getGraduationYears = async (req, res) => {
  try {
    const { universityId } = req.params;
    console.log(`📋 Fetching graduation years for university: ${universityId}`);

    if (!universityId) {
      return res.status(400).json({
        success: false,
        message: "University ID is required",
      });
    }

    const { data: years, error } = await supabaseClient
      .from("graduate_records")
      .select("graduation_year")
      .eq("university_id", universityId)
      .order("graduation_year", { ascending: false });

    if (error) {
      console.error("❌ Error fetching graduation years:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    // Get unique years
    const uniqueYears = [
      ...new Set(years?.map((y) => y.graduation_year) || []),
    ];
    console.log(
      `✅ Found graduation years for university ${universityId}: ${uniqueYears.join(
        ", "
      )}`
    );

    res.json({
      success: true,
      data: uniqueYears,
    });
  } catch (error) {
    console.error("💥 Get graduation years error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch graduation years",
      error: error.message,
    });
  }
};

// Verify student credentials
exports.verifyCredentials = async (req, res) => {
  try {
    const {
      studentName,
      registrationNumber,
      universityId,
      programId,
      graduationYear,
      verificationType = "both",
    } = req.body;

    console.log("🔍 Verifying credentials for:", {
      studentName,
      registrationNumber,
      universityId,
      programId,
      graduationYear,
      verificationType,
    });

    // Require registration number, make studentName optional
    if (!registrationNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Registration number is required",
      });
    }

    // Build query: registration number is required and must match exactly
    let query = supabaseClient.from("graduate_records").select(`
        *,
        university_profiles!inner(id, name, short_name),
        academic_programs!inner(id, program)
      `);

    query = query.eq("registration_number", registrationNumber.trim());

    // Optionally filter by student name (partial match, if provided)
    if (studentName?.trim()) {
      query = query.ilike("student_full_name", `%${studentName.trim()}%`);
    }

    if (universityId) {
      query = query.eq("university_id", universityId);
    }

    if (programId) {
      query = query.eq("program_id", programId);
    }

    if (graduationYear) {
      query = query.eq("graduation_year", graduationYear);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error("❌ Error searching records:", error);
      throw new Error(`Search error: ${error.message}`);
    }

    console.log(`🔍 Found ${records?.length || 0} matching records`);

    if (!records || records.length === 0) {
      return res.json({
        success: true,
        data: {
          found: false,
          message: "No matching credentials found",
        },
      });
    }

    // Always use the first (should be only) exact match
    const bestMatch = records[0];

    // Prepare response based on verification type
    const response = {
      found: true,
      student: {
        id: bestMatch.id,
        name: bestMatch.student_full_name,
        registrationNumber: bestMatch.registration_number,
        university: {
          id: bestMatch.university_profiles.id,
          name: bestMatch.university_profiles.name,
          shortName: bestMatch.university_profiles.short_name,
        },
        program: {
          id: bestMatch.academic_programs.id,
          name:
            bestMatch.academic_programs.name ||
            bestMatch.academic_programs.program ||
            "Unknown Program", // Handle different column names
        },
        graduationYear: bestMatch.graduation_year,
        isVerified: bestMatch.is_verified,
        status: bestMatch.is_verified ? "Verified" : "Pending Verification",
      },
    };

    // Add certificate info if requested
    if (verificationType === "certificate" || verificationType === "both") {
      if (bestMatch.certificate_url) {
        response.certificate = {
          available: true,
          url: bestMatch.certificate_url,
          verified: bestMatch.is_verified,
          uploadDate: bestMatch.created_at,
        };
      } else {
        response.certificate = {
          available: false,
          message: "Certificate not uploaded",
        };
      }
    }

    // Add transcript info if requested
    if (verificationType === "transcript" || verificationType === "both") {
      if (bestMatch.transcript_url) {
        response.transcript = {
          available: true,
          url: bestMatch.transcript_url,
          verified: bestMatch.is_verified,
          uploadDate: bestMatch.created_at,
        };
      } else {
        response.transcript = {
          available: false,
          message: "Transcript not uploaded",
        };
      }
    }

    console.log("✅ Credentials verification completed");

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("💥 Credential verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify credentials",
      error: error.message,
    });
  }
};

// Completely revised file preview handler - IMPROVED reliability with direct streaming approach
exports.getFilePreviewUrl = async (req, res) => {
  try {
    const fileUrl = req.body?.fileUrl || req.query?.fileUrl;
    console.log("🔗 Processing file request for:", fileUrl);

    if (!fileUrl) {
      return res
        .status(400)
        .json({ success: false, message: "File URL is required" });
    }

    // Extract the path after 'graduate-record/' (including university folder)
    const match = fileUrl.match(/graduate-record\/(.+?)(\?|$)/);
    const filePath = match ? match[1] : null;

    if (!filePath) {
      console.error("❌ Could not extract file path from URL:", fileUrl);
      return res.redirect(fileUrl);
    }

    // Use supabaseAdmin for signed URL generation (service role key)
    try {
      const { data, error } = await supabaseAdmin.storage
        .from("graduate-record")
        .createSignedUrl(filePath, 60 * 60); // 1 hour expiry

      if (error || !data?.signedUrl) {
        console.error("❌ Error creating signed URL:", error);
        return res.redirect(fileUrl);
      }

      console.log("✅ Redirecting to signed URL");
      return res.redirect(data.signedUrl);
    } catch (err) {
      console.error("❌ Exception creating signed URL:", err);
      return res.redirect(fileUrl);
    }
  } catch (error) {
    console.error("💥 File preview error:", error);
    const originalUrl = req.body?.fileUrl || req.query?.fileUrl;
    if (originalUrl) {
      return res.redirect(originalUrl);
    }
    res.status(500).json({
      success: false,
      message: "Failed to process file",
      error: error.message,
    });
  }
};
