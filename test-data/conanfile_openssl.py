from conan import ConanFile

class OpenSSLConan(ConanFile):
    name = "openssl"
    version = "3.2.1"
    description = "TLS/SSL and crypto library"
    license = "Apache-2.0"
    url = "https://www.openssl.org"
    topics = ("ssl", "tls", "encryption", "security")

    def requirements(self):
        self.requires("zlib/1.3.1")

    def package_info(self):
        self.cpp_info.libs = ["ssl", "crypto"]
