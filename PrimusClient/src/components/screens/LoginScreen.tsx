import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, User, Lock, Loader2, RefreshCw } from 'lucide-react';
import { invoke } from '../../utils/invoke';
import { useAuthStore } from '../../stores/authStore';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuthStore();

  const handleDeviceReset = async () => {
    if (window.confirm("DEBUG: This will clear local device registration. Continue?")) {
      try {
        await invoke("reset_device_credentials");
        window.location.reload();
      } catch (e) {
        console.error("Reset failed", e);
      }
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    const success = await login(data.email, data.password);
    if (!success) {
      // Error handling is done in the store
    }
  };

  return (
    <div className="login-container">
      <div className="login-form animate-slide-in-bottom">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
            <LogIn className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gradient mb-2">
            Primus Gaming Cafe
          </h1>
          <p className="text-secondary-400">
            Welcome back! Please sign in to continue.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Email Field */}
          <div className="space-y-2">
            <label htmlFor="email" className="label">
              Email Address
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <input
                {...register('email')}
                type="email"
                id="email"
                className="input pl-11"
                placeholder="Enter your email"
                disabled={isLoading}
                autoComplete="email"
                autoFocus
              />
            </div>
            {errors.email && (
              <p className="text-sm text-error-500">{errors.email.message}</p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <label htmlFor="password" className="label">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <input
                {...register('password')}
                type="password"
                id="password"
                className="input pl-11"
                placeholder="Enter your password"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
            {errors.password && (
              <p className="text-sm text-error-500">{errors.password.message}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full h-12 text-lg font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Signing In...
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5 mr-2" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-secondary-400">
          <p>Need help? Contact your system administrator</p>

          {/* Hidden Reset for Development */}
          <button
            onClick={handleDeviceReset}
            className="mt-4 text-[10px] text-secondary-600 hover:text-secondary-400 uppercase tracking-widest flex items-center justify-center mx-auto gap-1 transition-colors"
          >
            <RefreshCw className="w-2 h-2" />
            Reset Device Registration
          </button>

          <div className="mt-4 pt-4 border-t border-secondary-700">
            <p className="text-xs">
              Primus Gaming Cafe Management System v1.0
            </p>
          </div>
        </div>

        {/* Quick Access for Testing (Development Only) */}
        {import.meta.env.DEV && (
          <div className="mt-6 p-4 bg-secondary-800/50 rounded-lg border border-secondary-600">
            <p className="text-xs text-secondary-400 mb-3">Quick Access (Dev Mode)</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  const form = document.querySelector('form') as HTMLFormElement;
                  const emailInput = form.querySelector('input[type="email"]') as HTMLInputElement;
                  const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
                  emailInput.value = 'admin@primus.com';
                  passwordInput.value = 'admin123';
                }}
                className="btn-outline text-xs py-1 px-2"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  const form = document.querySelector('form') as HTMLFormElement;
                  const emailInput = form.querySelector('input[type="email"]') as HTMLInputElement;
                  const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
                  emailInput.value = 'staff@primus.com';
                  passwordInput.value = 'staff123';
                }}
                className="btn-outline text-xs py-1 px-2"
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => {
                  const form = document.querySelector('form') as HTMLFormElement;
                  const emailInput = form.querySelector('input[type="email"]') as HTMLInputElement;
                  const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
                  emailInput.value = 'user@primus.com';
                  passwordInput.value = 'user123';
                }}
                className="btn-outline text-xs py-1 px-2"
              >
                Client
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-primary-500/10 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-secondary-500/10 to-transparent rounded-full blur-3xl"></div>
      </div>
    </div>
  );
};

export default LoginScreen;
