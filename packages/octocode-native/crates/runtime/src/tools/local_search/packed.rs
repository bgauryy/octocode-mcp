//! A stored scan in compact form: every field of a scan's files, written as
//! variable-length integers and length-prefixed text into one deflated
//! buffer, beside its stats. Lossless: [`Packed::unpack`] returns exactly the
//! scan [`Packed::pack`] was given, so a stored scan of any size costs its
//! compressed bytes, and a page served from it reads the scan once instead of
//! walking the tree again.

use octocode_engine::types::{
    SearchedSource, TextSearchFile, TextSearchMatch, TextSearchResult, TextSearchStats,
};
use std::io::{BufWriter, Read, Write};
use std::time::{Duration, SystemTime};

/// A scan packed by [`Packed::pack`].
pub struct Packed {
    /// The deflated files.
    bytes: Vec<u8>,
    /// Bytes the files take unpacked: the buffer [`Packed::unpack`] inflates.
    raw_len: usize,
    files: usize,
    stats: TextSearchStats,
}

impl Packed {
    /// `scan` packed, or `None` when its files take more than `max_raw`
    /// bytes unpacked (a page would inflate that much to read it).
    pub fn pack(scan: &TextSearchResult, max_raw: usize) -> Option<Self> {
        let mut out = Writer {
            sink: BufWriter::with_capacity(
                64 * 1024,
                flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast()),
            ),
            written: 0,
            max: max_raw,
        };
        for file in &scan.files {
            out.file(file)?;
        }
        let raw_len = out.written;
        let bytes = out.sink.into_inner().ok()?.finish().ok()?;
        Some(Self {
            bytes,
            raw_len,
            files: scan.files.len(),
            stats: scan.stats.clone(),
        })
    }

    /// The scan this was packed from.
    pub fn unpack(&self) -> Option<TextSearchResult> {
        let mut raw = Vec::with_capacity(self.raw_len);
        flate2::read::DeflateDecoder::new(self.bytes.as_slice())
            .take(self.raw_len as u64)
            .read_to_end(&mut raw)
            .ok()?;
        let mut reader = Reader { raw: &raw, at: 0 };
        let files = (0..self.files)
            .map(|_| reader.file())
            .collect::<Option<Vec<_>>>()?;
        (reader.at == raw.len()).then(|| TextSearchResult {
            files,
            stats: self.stats.clone(),
        })
    }

    /// Bytes this keeps in memory: the deflated files.
    pub fn weight(&self) -> usize {
        self.bytes.len()
    }
}

struct Writer<W: Write> {
    sink: W,
    written: usize,
    max: usize,
}

impl<W: Write> Writer<W> {
    fn bytes(&mut self, bytes: &[u8]) -> Option<()> {
        self.written = self.written.checked_add(bytes.len())?;
        (self.written <= self.max).then_some(())?;
        self.sink.write_all(bytes).ok()
    }

    /// LEB128: seven bits a byte, low first, high bit set on all but the last.
    fn number(&mut self, mut value: u64) -> Option<()> {
        let mut buffer = [0u8; 10];
        let mut len = 0;
        loop {
            let low = (value & 0x7f) as u8;
            value >>= 7;
            if value == 0 {
                buffer[len] = low;
                len += 1;
                break;
            }
            buffer[len] = low | 0x80;
            len += 1;
        }
        self.bytes(&buffer[..len])
    }

    fn text(&mut self, text: &str) -> Option<()> {
        self.number(text.len() as u64)?;
        self.bytes(text.as_bytes())
    }

    /// `None` as 0, `Some(n)` as n + 1.
    fn optional(&mut self, value: Option<u32>) -> Option<()> {
        self.number(value.map_or(0, |n| u64::from(n) + 1))
    }

    fn file(&mut self, file: &TextSearchFile) -> Option<()> {
        self.text(&file.path)?;
        self.number(u64::from(file.match_count))?;
        match &file.source {
            None => self.number(0)?,
            Some(source) => {
                self.number(1)?;
                self.number(source.size)?;
                self.time(source.modified)?;
                self.bytes(&source.digest)?;
            }
        }
        self.number(file.matches.len() as u64)?;
        for hit in &file.matches {
            self.number(u64::from(hit.line))?;
            self.number(u64::from(hit.column))?;
            self.number(u64::from(hit.byte_offset))?;
            self.text(&hit.value)?;
            self.bytes(&hit.value_digest)?;
            for value in [hit.count, hit.rank, hit.original_chars, hit.original_bytes] {
                self.optional(value)?;
            }
        }
        Some(())
    }

    /// No time as 0; a time at or after the epoch as 1, before it as 2,
    /// then the distance in seconds and nanoseconds.
    fn time(&mut self, time: Option<SystemTime>) -> Option<()> {
        let Some(time) = time else {
            return self.number(0);
        };
        let (tag, distance) = match time.duration_since(SystemTime::UNIX_EPOCH) {
            Ok(after) => (1, after),
            Err(before) => (2, before.duration()),
        };
        self.number(tag)?;
        self.number(distance.as_secs())?;
        self.number(u64::from(distance.subsec_nanos()))
    }
}

struct Reader<'a> {
    raw: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn bytes(&mut self, len: usize) -> Option<&[u8]> {
        let end = self.at.checked_add(len)?;
        let bytes = self.raw.get(self.at..end)?;
        self.at = end;
        Some(bytes)
    }

    fn number(&mut self) -> Option<u64> {
        let mut value = 0u64;
        for shift in (0..64).step_by(7) {
            let byte = *self.raw.get(self.at)?;
            self.at += 1;
            value |= u64::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                return Some(value);
            }
        }
        None
    }

    fn small(&mut self) -> Option<u32> {
        u32::try_from(self.number()?).ok()
    }

    fn text(&mut self) -> Option<String> {
        let len = usize::try_from(self.number()?).ok()?;
        String::from_utf8(self.bytes(len)?.to_vec()).ok()
    }

    fn optional(&mut self) -> Option<Option<u32>> {
        match self.number()? {
            0 => Some(None),
            n => u32::try_from(n - 1).ok().map(Some),
        }
    }

    fn file(&mut self) -> Option<TextSearchFile> {
        let path = self.text()?;
        let match_count = self.small()?;
        let source = match self.number()? {
            0 => None,
            1 => Some(SearchedSource {
                size: self.number()?,
                modified: self.time()?,
                digest: self.bytes(32)?.try_into().ok()?,
            }),
            _ => return None,
        };
        let hits = usize::try_from(self.number()?).ok()?;
        let mut matches = Vec::with_capacity(hits.min(self.raw.len()));
        for _ in 0..hits {
            matches.push(TextSearchMatch {
                line: self.small()?,
                column: self.small()?,
                byte_offset: self.small()?,
                value: self.text()?,
                value_digest: self.bytes(32)?.try_into().ok()?,
                count: self.optional()?,
                rank: self.optional()?,
                original_chars: self.optional()?,
                original_bytes: self.optional()?,
            });
        }
        Some(TextSearchFile {
            path,
            match_count,
            matches,
            source,
        })
    }

    fn time(&mut self) -> Option<Option<SystemTime>> {
        let tag = self.number()?;
        if tag == 0 {
            return Some(None);
        }
        let distance = Duration::from_secs(self.number()?)
            .checked_add(Duration::from_nanos(self.number()?))?;
        match tag {
            1 => SystemTime::UNIX_EPOCH.checked_add(distance).map(Some),
            2 => SystemTime::UNIX_EPOCH.checked_sub(distance).map(Some),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(line: u32, value: &str) -> TextSearchMatch {
        TextSearchMatch {
            line,
            column: line * 3,
            byte_offset: line * 5,
            value: value.to_owned(),
            value_digest: <sha2::Sha256 as sha2::Digest>::digest(value.trim().as_bytes()).into(),
            count: line.is_multiple_of(2).then_some(line),
            rank: Some(line % 4),
            original_chars: line.is_multiple_of(3).then_some(4_000),
            original_bytes: line.is_multiple_of(3).then_some(u32::MAX),
        }
    }

    fn assert_same(left: &TextSearchResult, right: &TextSearchResult) {
        assert_eq!(left.files.len(), right.files.len());
        for (a, b) in left.files.iter().zip(&right.files) {
            assert_eq!(
                (&a.path, a.match_count, a.source),
                (&b.path, b.match_count, b.source)
            );
            assert_eq!(a.matches.len(), b.matches.len());
            for (x, y) in a.matches.iter().zip(&b.matches) {
                assert_eq!(
                    (
                        x.line,
                        x.column,
                        x.byte_offset,
                        &x.value,
                        x.value_digest,
                        x.count,
                        x.rank,
                        x.original_chars,
                        x.original_bytes
                    ),
                    (
                        y.line,
                        y.column,
                        y.byte_offset,
                        &y.value,
                        y.value_digest,
                        y.count,
                        y.rank,
                        y.original_chars,
                        y.original_bytes
                    )
                );
            }
        }
        assert_eq!(left.stats.match_count, right.stats.match_count);
        assert_eq!(left.stats.cap_reason, right.stats.cap_reason);
    }

    /// Every field of every file comes back exactly, multibyte text,
    /// empty values, times either side of the epoch and absent ones
    /// included, and the packed bytes are smaller than the values.
    #[test]
    fn a_packed_scan_unpacks_to_the_same_scan() {
        let line = "fn needle(x: u32) -> u32 { x + 1 } // 中文 ✓".repeat(3);
        let files = (0..200u32)
            .map(|n| TextSearchFile {
                path: format!("/repo/src/module_{n}/file.rs"),
                match_count: n,
                matches: (0..n % 7)
                    .map(|l| hit(l, if l == 1 { "" } else { &line }))
                    .collect(),
                source: match n % 3 {
                    0 => None,
                    1 => Some(SearchedSource {
                        size: u64::from(n) << 40,
                        modified: Some(SystemTime::UNIX_EPOCH + Duration::new(1_700_000_000, n)),
                        digest: [n as u8; 32],
                    }),
                    _ => Some(SearchedSource {
                        size: 0,
                        modified: SystemTime::UNIX_EPOCH.checked_sub(Duration::new(5, 7)),
                        digest: [7; 32],
                    }),
                },
            })
            .collect::<Vec<_>>();
        let scan = TextSearchResult {
            files,
            stats: TextSearchStats {
                match_count: Some(600),
                cap_reason: Some("maxCollectedFiles".into()),
                ..Default::default()
            },
        };
        let packed = Packed::pack(&scan, usize::MAX).expect("packed");
        assert_same(&packed.unpack().expect("unpacked"), &scan);
        let values = scan
            .files
            .iter()
            .flat_map(|file| &file.matches)
            .map(|hit| hit.value.len())
            .sum::<usize>();
        assert!(
            packed.weight() * 5 < values,
            "{} vs {values}",
            packed.weight()
        );
        // Past the unpacked bound nothing is packed.
        assert!(Packed::pack(&scan, packed.raw_len - 1).is_none());
        assert!(Packed::pack(&scan, packed.raw_len).is_some());
    }

    #[test]
    fn an_empty_scan_packs() {
        let scan = TextSearchResult {
            files: Vec::new(),
            stats: TextSearchStats::default(),
        };
        let packed = Packed::pack(&scan, 0).expect("packed");
        assert!(packed.unpack().expect("unpacked").files.is_empty());
    }
}
