export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Choose your role and set up your TruckRSA account.
        </p>

        <form className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Account type</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring">
              <option value="driver">Driver</option>
              <option value="fleet_manager">Fleet Manager</option>
              <option value="repair_shop">Repair Shop</option>
              <option value="mobile_mechanic">Mobile Mechanic</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Full name</label>
            <input
              type="text"
              placeholder="John Doe"
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              placeholder="you@email.com"
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              placeholder="Create a password"
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            />
          </div>

          <button
            type="button"
            className="w-full rounded-xl bg-black py-2.5 text-white font-medium hover:opacity-90"
          >
            Create Account
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-600">
          Already have an account?{" "}
          <a className="font-medium text-black underline" href="/auth/sign-in">
            Sign in
          </a>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          (Next step: save the role to Firestore and route to the right dashboard.)
        </div>
      </div>
    </main>
  );
}
