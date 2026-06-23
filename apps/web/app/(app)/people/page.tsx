import { PeopleClient } from "@/components/people/PeopleClient";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getPeopleForUser } from "@/lib/db/queries/people";

/**
 * /people — the personal knowledge-graph roster.
 *
 * Server Component shell + PeopleClient island (mirrors /captures): fetch the
 * roster with reference counts on the server so the grid paints with no flash,
 * then hand plain props to the client island which owns Realtime + Query.
 */
export default async function PeoplePage() {
  const user = await requireOnboarded();
  const people = await getPeopleForUser(user.id);

  return <PeopleClient userId={user.id} initialPeople={people} />;
}
