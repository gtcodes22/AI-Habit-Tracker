import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
        },
        avatar: {
            type: String,
            default: "",
        },
        morningMotivation: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Hash the password before saving, but only if it was set or changed.
// This keeps profile updates from re-hashing an already hashed password.
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare a plain-text password with the stored hash (used at login).
userSchema.methods.matchPassword = function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
};

// Never send the password hash to the client, even by accident.
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

export default mongoose.model("User", userSchema);
