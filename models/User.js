const { validateLocaleAndSetLanguage } = require("typescript");
const mongoose = require("../database");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  number: { type: String, unique: true, required: true},
  password: { type: String, required: true },
  role: { type: Int, required: true } || 1
}, { timestamps: true });

// Gabarito de Role
// 1 - Suporte
// 2 - Treinamento
// 3 - Vendas
// 4 - Assistência Técnica
// 5 - Admin
// 6 - Suporte & Treinamento
// 7 - Vendas & Treinamento
// 8 - Vendas & Suporte
// 9 - Suporte & A.T.
// 10 - Vendas & A.T.
// 11 - Treinamento & A.T.
// 12 - Vendas & A.T. & Suporte
// 13 - Vendas & A.T. & Treinamento
// 14 - Treinamento & A.T. & Suporte
// 15 - Vendas & Treinamento & Suporte

// Antes de salvar, criptografa a senha
UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Verificar senha
UserSchema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", UserSchema);