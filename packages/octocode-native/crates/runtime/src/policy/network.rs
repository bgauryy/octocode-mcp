//! Which network addresses Octocode may connect to on a caller's behalf.
//! One predicate for every outbound target a query names (a captured URL, a
//! custom registry): drift between copies would let one path reach an
//! internal network the other refuses.
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// Publicly routable unicast: not loopback, private, link-local, shared
/// (CGNAT), documentation, benchmarking, multicast, broadcast, reserved or
/// unspecified, nor an IPv6 form that embeds or tunnels such an address.
pub(crate) fn is_public(ip: IpAddr) -> bool {
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
}
