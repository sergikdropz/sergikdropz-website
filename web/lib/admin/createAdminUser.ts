import type { SupabaseClient } from '@supabase/supabase-js'

type CreateAdminUserResult = {
  userId: string
  wasExisting: boolean
  message: string
}

export async function createAdminUser(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<CreateAdminUserResult> {
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    if (authError?.message.includes('already registered')) {
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users.find((u) => u.email === email)

      if (existingUser) {
        const { error: adminError } = await supabase
          .from('admins')
          .upsert(
            {
              user_id: existingUser.id,
              email: existingUser.email,
              active: true,
            },
            {
              onConflict: 'user_id',
            }
          )

        if (adminError) {
          throw new Error(`Failed to add user to admins table: ${adminError.message}`)
        }

        return {
          userId: existingUser.id,
          wasExisting: true,
          message: 'Admin user already exists and has been added to admins table',
        }
      }
    }

    throw new Error(authError?.message || 'Failed to create user')
  }

  const userId = authData.user.id

  const { error: adminError } = await supabase
    .from('admins')
    .insert({
      user_id: userId,
      email,
      active: true,
    })

  if (adminError) {
    await supabase.auth.admin.deleteUser(userId)
    throw new Error(`Failed to add user to admins table: ${adminError.message}`)
  }

  return {
    userId,
    wasExisting: false,
    message: 'Admin user created successfully',
  }
}
