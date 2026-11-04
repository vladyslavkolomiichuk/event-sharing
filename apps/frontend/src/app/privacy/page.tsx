export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 leading-7">
      <h1>Privacy policy</h1>
      <p>
        Vladyslav Kolomiichuk is responsible for personal data processed by
        Event Sharing. Questions and requests about your data can be sent to{' '}
        <a className="underline" href="mailto:vladkolomu@gmail.com">
          vladkolomu@gmail.com
        </a>
        .
      </p>
      <section>
        <h2>What we process</h2>
        <p>
          Auth stores your email, password hash or connected OAuth accounts, and
          sessions. Your public profile contains your display name and username.
          Your bio, city, phone, and avatar follow your privacy settings. Email,
          credentials, and device coordinates are not public profile fields.
          Event and chat services retain the content you submit and the internal
          user IDs needed to keep conversations and participation consistent.
          Storage keeps images you upload and the metadata needed to protect and
          manage them. Event images follow the event&apos;s access rules.
        </p>
      </section>
      <section>
        <h2>Location and external providers</h2>
        <p>
          Device location is requested only after you choose it. A search sends
          the selected coordinates to Geo Search for that request; search
          analytics record only whether a location was used and the result
          count. Map tiles come from OpenFreeMap, place suggestions from Photon,
          and routes currently use Interline&apos;s Transitland Valhalla API.
          Selecting an event venue on the map sends its exact coordinates to
          Photon to suggest an address. A route request sends its start and
          destination coordinates and travel mode to that provider, without your
          account ID. These providers receive the requests needed to serve those
          features.
        </p>
      </section>
      <section>
        <h2>Visibility and access</h2>
        <p>
          You can restrict who opens your profile and independently control
          username discovery, friend requests, city, and phone. Participation
          history is private unless you enable it for completed public events.
          Public events can appear in search. Unlisted events require a direct
          link, and invite-only events require access. The exact address of a
          private venue is restricted, while its approximate map point may
          reveal the nearby streets.
        </p>
      </section>
      <section>
        <h2>Purpose and legal basis</h2>
        <p>
          Account, event, participation, and messaging data are processed to
          provide the service you request (contract). Optional public profile
          fields and device location follow your choices (consent). Limited
          operational records support reliability and abuse prevention
          (legitimate interests). You can change optional visibility choices in
          Privacy settings and stop sharing device location through your browser
          settings.
        </p>
        <p>
          A sign-in email and an authentication method are required to use an
          account. Profile biography, phone, city, device location, and social
          sign-in are optional. The service does not make decisions with legal
          or similarly significant effects solely by automated processing.
        </p>
      </section>
      <section>
        <h2>Retention and requests</h2>
        <p>
          Event Log removes entries after the configured retention period, which
          is currently 365 days. Kafka event topics retain records for 30 days.
          Account, event, participation, notification, and chat data are kept
          while the account and related activities need them. The project does
          not currently maintain separate database backups outside its Docker
          volumes. Host application log retention is managed separately and is
          not yet fixed by this project. You can download your data and submit
          an account deletion request in Privacy settings. Requests are reviewed
          manually; shared event and message records may be anonymized to
          preserve other participants&apos; history. For access, correction, or
          other requests, contact the address above.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          You can ask to access, correct, erase, restrict, or transfer your
          data, and object to processing based on legitimate interests. You can
          withdraw optional sharing choices in Privacy settings. Contact the
          address above for requests that the site cannot complete directly. You
          may also lodge a complaint with the data protection authority in your
          country of residence or work.
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>
          The site uses session and OAuth state cookies to sign you in and keep
          your account secure. These are needed for authentication. The site
          does not use advertising cookies.
        </p>
      </section>
    </article>
  );
}
