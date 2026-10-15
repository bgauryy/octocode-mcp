//! One HTTPS request of a URL capture, to a public address only. Each hop
//! resolves its host here, refuses any address that is not publicly
//! routable, and pins the connection to exactly the checked addresses, so a
//! second DNS answer cannot redirect it to a private network. The request
//! carries no credential or cookie and follows no redirect itself; the body
//! is read within the request budget and a byte limit.
use super::{Reply, failure};
use crate::tools::judgment::ClassificationError;
use octocode_github::{BodyError, BudgetStop, RequestBudget, read_bounded};
use octocode_io::http::{ClientPolicy, Proxy};
use reqwest::header::{ACCEPT, CONTENT_TYPE, LOCATION};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use url::{Host, Url};

/// The largest response body a capture reads.
pub(super) const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

pub(super) const ACCEPTED: &str = "text/html, text/plain;q=0.9, text/markdown;q=0.9";

/// One request, without following its redirect.
pub(super) trait Fetch {
    fn get(&self, url: &Url) -> Result<Reply, ClassificationError>;
}

/// The network fetcher: requests run on the runtime under `budget`.
pub(super) struct Network<'a> {
    pub handle: &'a tokio::runtime::Handle,
    pub budget: RequestBudget,
    pub accept: &'a str,
}

impl Fetch for Network<'_> {
    fn get(&self, url: &Url) -> Result<Reply, ClassificationError> {
        self.handle.block_on(self.request(url))
    }
}

impl Network<'_> {
    async fn request(&self, url: &Url) -> Result<Reply, ClassificationError> {
        let host = url
            .host()
            .ok_or_else(|| denied("The URL names no host."))?
            .to_owned();
        let port = url.port_or_known_default().unwrap_or(443);
        let addresses = match &host {
            Host::Ipv4(ip) => vec![SocketAddr::new(IpAddr::V4(*ip), port)],
            Host::Ipv6(ip) => vec![SocketAddr::new(IpAddr::V6(*ip), port)],
            Host::Domain(name) => self
                .budget
                .wait(tokio::net::lookup_host((name.as_str(), port)))
                .await
                .map_err(stopped)?
                .map_err(|_| unreachable(&host, "its name does not resolve"))?
                .collect(),
        };
        let addresses = public_addresses(&host, addresses)?;
        let policy = ClientPolicy {
            proxy: Proxy::Direct,
            resolve: match &host {
                Host::Domain(name) => Some((name.clone(), addresses)),
                _ => None,
            },
            user_agent: Some(concat!("octocode-native/", env!("CARGO_PKG_VERSION"))),
            ..ClientPolicy::default()
        };
        let client = octocode_io::http::client(&policy).map_err(|_| {
            failure(
                "classificationContextFailed",
                "The page request could not be prepared.",
                "Retry; supply the page text as state if it keeps failing.",
            )
        })?;
        let mut target = url.clone();
        target.set_fragment(None);
        let response = self
            .budget
            .wait(client.get(target).header(ACCEPT, self.accept).send())
            .await
            .map_err(stopped)?
            .map_err(|_| unreachable(&host, "the connection failed"))?;
        let status = response.status().as_u16();
        let header = |name| {
            response
                .headers()
                .get(name)
                .and_then(|value: &reqwest::header::HeaderValue| value.to_str().ok())
                .map(str::to_owned)
        };
        let location = header(LOCATION);
        let content_type = header(CONTENT_TYPE);
        let body = if (200..300).contains(&status) {
            read_bounded(response, &self.budget, self.budget.max_body_bytes)
                .await
                .map_err(|error| match error {
                    BodyError::Stopped(stop) => stopped(stop),
                    BodyError::TooLarge => failure(
                        "classificationContextTooLarge",
                        format!(
                            "The page body exceeds the {} MiB capture limit; nothing was judged.",
                            self.budget.max_body_bytes / (1024 * 1024)
                        ),
                        "Select a smaller page or section, or supply the text as state.",
                    ),
                    BodyError::Transport => unreachable(&host, "the body read failed"),
                })?
                .to_vec()
        } else {
            Vec::new()
        };
        Ok(Reply {
            status,
            location,
            content_type,
            body,
        })
    }
}

/// `addresses` when every one is publicly routable.
pub(super) fn public_addresses(
    host: &Host<String>,
    addresses: Vec<SocketAddr>,
) -> Result<Vec<SocketAddr>, ClassificationError> {
    if addresses.is_empty() {
        return Err(unreachable(host, "its name has no address"));
    }
    if let Some(blocked) = addresses.iter().find(|address| !is_public(address.ip())) {
        return Err(denied(&format!(
            "{host} resolves to {}, which is not a public address.",
            blocked.ip()
        )));
    }
    Ok(addresses)
}

/// Publicly routable unicast: not loopback, private, link-local, shared
/// (CGNAT), documentation, benchmarking, multicast, broadcast, reserved or
/// unspecified, nor an IPv6 form that embeds or tunnels such an address.
pub(super) fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_v4(ip),
        IpAddr::V6(ip) => is_public_v6(ip),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_multicast()
        || ip.is_broadcast()
        || ip.is_documentation()
        || a == 0
        // Shared address space (RFC 6598).
        || (a == 100 && (64..128).contains(&b))
        // IETF protocol assignments (RFC 6890).
        || (a == 192 && b == 0 && c == 0)
        // Benchmarking (RFC 2544).
        || (a == 198 && (18..20).contains(&b))
        // Reserved (RFC 1112).
        || a >= 240)
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_public_v4(v4);
    }
    let segments = ip.segments();
    let embedded = |high: u16, low: u16| {
        let [a, b] = high.to_be_bytes();
        let [c, d] = low.to_be_bytes();
        Ipv4Addr::new(a, b, c, d)
    };
    // NAT64 (RFC 6052) and 6to4 (RFC 3056) carry an IPv4 destination.
    if segments[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return is_public_v4(embedded(segments[6], segments[7]));
    }
    if segments[0] == 0x2002 {
        return is_public_v4(embedded(segments[1], segments[2]));
    }
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
        // IPv4-compatible (deprecated) ::a.b.c.d.
        || segments[..6] == [0; 6]
        // Site-local (deprecated).
        || (segments[0] & 0xffc0) == 0xfec0
        // Documentation (RFC 3849).
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
        // Teredo tunnels (RFC 4380).
        || (segments[0] == 0x2001 && segments[1] == 0)
        // Discard-only (RFC 6666).
        || segments[..4] == [0x100, 0, 0, 0])
}

pub(super) fn denied(message: &str) -> ClassificationError {
    failure(
        "securityValidationFailed",
        message,
        "Capture only public HTTPS pages; read internal pages with a local reader.",
    )
}

fn unreachable(host: &Host<String>, why: &str) -> ClassificationError {
    failure(
        "classificationContextFailed",
        format!("The page at {host} could not be fetched: {why}."),
        "Check the URL, or supply the page text as state.",
    )
}

fn stopped(stop: BudgetStop) -> ClassificationError {
    match stop {
        BudgetStop::Deadline => failure(
            "timeout",
            "The page was not fetched before the call's deadline.",
            "Retry with more time, or supply the page text as state.",
        ),
        BudgetStop::Cancelled => failure(
            "cancelled",
            "The call stopped before its page was fetched.",
            "Retry only if the judgment is still needed.",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_publicly_routable_addresses_pass() {
        for public in [
            "93.184.216.34",
            "8.8.8.8",
            "100.128.0.1",
            "2606:4700::1111",
            "::ffff:93.184.216.34",
            "64:ff9b::808:808",
            "2002:5db8:d822::1",
        ] {
            assert!(is_public(public.parse().unwrap()), "{public}");
        }
        for internal in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.169.254",
            "0.0.0.0",
            "0.1.2.3",
            "100.64.0.1",
            "192.0.0.8",
            "192.0.2.1",
            "198.18.0.1",
            "198.51.100.1",
            "203.0.113.1",
            "224.0.0.1",
            "240.0.0.1",
            "255.255.255.255",
            "::",
            "::1",
            "::127.0.0.1",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "fec0::1",
            "ff02::1",
            "2001:db8::1",
            "2001::1",
            "100::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
            "64:ff9b::a00:1",
            "2002:c0a8:0101::1",
        ] {
            assert!(!is_public(internal.parse().unwrap()), "{internal}");
        }
    }

    #[test]
    fn one_internal_answer_denies_the_whole_host() {
        let host = Host::Domain("docs.example.org".to_owned());
        let mixed = vec![
            "93.184.216.34:443".parse().unwrap(),
            "10.0.0.5:443".parse().unwrap(),
        ];
        let error = public_addresses(&host, mixed).unwrap_err();
        assert_eq!(error.code, "securityValidationFailed");
        assert!(error.message.contains("10.0.0.5"), "{}", error.message);
        let error = public_addresses(&host, Vec::new()).unwrap_err();
        assert_eq!(error.code, "classificationContextFailed");
        let one = vec!["93.184.216.34:443".parse().unwrap()];
        assert_eq!(public_addresses(&host, one.clone()).unwrap(), one);
    }

    fn network(runtime: &tokio::runtime::Runtime) -> Network<'_> {
        Network {
            handle: runtime.handle(),
            accept: ACCEPTED,
            budget: RequestBudget::with_timeout(std::time::Duration::from_secs(5), MAX_BODY_BYTES),
        }
    }

    #[test]
    fn a_loopback_or_private_host_is_refused_before_connecting() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        // Nothing listens on these ports: a connection attempt would fail
        // as classificationContextFailed, not as a denial.
        for address in [
            "https://127.0.0.1:9/",
            "https://[::1]:9/",
            "https://localhost:9/",
            "https://169.254.169.254/latest/meta-data/",
            "https://10.0.0.1:9/",
        ] {
            let error = network(&runtime)
                .get(&Url::parse(address).unwrap())
                .err()
                .unwrap();
            assert_eq!(
                error.code, "securityValidationFailed",
                "{address}: {error:?}"
            );
        }
    }
}
