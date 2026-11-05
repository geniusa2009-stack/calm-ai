import { PROVIDERS, providerById } from "@/lib/signals/providers";
import { connections, removeProviderData } from "@/lib/signals/store";
import { route } from "@/lib/http";
import { BadRequest } from "@/lib/validate";

export const dynamic = "force-dynamic";

export const GET = route((_req, { user }) => ({
  providers: PROVIDERS.map(({ id, name, status, kinds, description }) => ({ id, name, status, kinds, description })),
  connections: connections(user.id),
}));

/** Remove everything one provider contributed. */
export const DELETE = route((req, { user }) => {
  const id = new URL(req.url).searchParams.get("provider") ?? "";
  if (!providerById(id)) throw new BadRequest("Unknown provider");
  removeProviderData(user.id, id);
});
